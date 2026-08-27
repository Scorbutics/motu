-- Attach the profile trigger to GoTrue's own table.
--
-- A SEPARATE FILE because of an ordering nothing in compose can express: `auth.users` does not exist
-- until the auth container has booted and run its own migrations, and `docker-entrypoint-initdb.d`
-- runs strictly BEFORE that, on an empty database. So this one is applied by `apply-migrations.sh`
-- afterwards, against a database that is already up. It is idempotent, like every file here, because
-- that script re-applies all of them every time rather than tracking which have run.
do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'auth.users does not exist yet — start the auth container and re-run apply-migrations.sh';
  end if;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
