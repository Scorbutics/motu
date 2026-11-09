// Who you can be in this demo.
//
// THE CLUB HAS NO LOGIN, AND THIS IS NOT ONE. A real club app knows who is looking — it is what turns
// "events" into "your events" — so the sidebar offers four members to act as, and the choice is kept
// in this browser. Anyone can pick anyone: there is no password, and the RSVP policy in the database
// says so in as many words (see the events migration). It is the honest stand-in for auth in a demo,
// and it is labelled as one on screen.
//
// Four, chosen so each walks a different path through the app — a premium regular, a newer standard
// member, a premium member on a hot streak, and a suspended membership that the backend refuses to
// RSVP for. Real seed members, by membership number: what they show is what the club's rules say.
import { memberIdOf } from './chapter-types.js';

export interface Persona {
  id: string;
  memberNo: string;
  name: string;
  /** Why this one is in the list — shown under the name in the switcher. */
  note: string;
}

export const PERSONAS: Persona[] = [
  { id: memberIdOf('702564'), memberNo: '702564', name: 'Dennis Shaw', note: 'Premium · Northwest coastal' },
  { id: memberIdOf('702504'), memberNo: '702504', name: 'Guido Bartik', note: 'Premium · on a hot streak' },
  { id: memberIdOf('702506'), memberNo: '702506', name: 'Rich Stroustrup', note: 'Standard · joined last year' },
  { id: memberIdOf('702524'), memberNo: '702524', name: 'Karen Okonkwo', note: 'Suspended membership' },
];

export const PERSONA_NUMBERS = PERSONAS.map((p) => p.memberNo);

/** The signed-in member as the chrome needs it: enough to say who, never the whole row. */
export interface SignedIn {
  id: string;
  name: string;
  initials: string;
  chapter: string | null;
}
