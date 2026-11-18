// ============================================================================
//  Backend connection - edit this file to connect to your real backend.
// ============================================================================
// Every report is tied to a SESSION ID issued by the backend. One session = one
// test of one subject. The app gets the session ID in one of these ways:
//   1. URL:  index.html?session=<SESSION_ID>[&subject=<SUBJECT_ID>]   (the backend / other system opens this link)
//   2. "Current session" button -> GET currentSessionPath (the backend returns the active session)
//   3. Typed / picked by the user in the Session ID field
// It then requests that session's measurements and checks that the response really
// belongs to the requested session (and subject, when given) before building the report.
const APP_CONFIG = {
  // Base URL of the backend. '' = same server that serves this app (serve.ps1 = mock backend).
  backendBaseUrl: '',

  // Measurements of one session. Placeholders: {sessionId}, {subjectId} (subjectId may be empty).
  measurementPath: '/api/sessions/{sessionId}/measurements',

  // Returns the session currently open on the backend: { "session_id": "...", "subject_id": "..." }. '' to disable.
  currentSessionPath: '/api/sessions/current',

  // Returns a list of sessions for the drop-down: [{ "session_id", "subject_id", "subject_name", "test_date" }]. '' to disable.
  listPath: '/api/sessions',

  // Extra request headers, e.g. { Authorization: 'Bearer <token>' }
  headers: {},

  // Reject a response whose session_id / subject id does not match the requested one.
  strictSessionMatch: true,

  // Add a second PDF page with a table of all measured values.
  summaryPage: true,
};

/**
 * Converts the backend's measurement response into the app's schema (see samples/*.json and README).
 * The result must carry the session ID as `session_id` (and the subject as `subject.id`).
 * If your backend already returns that schema, leave this as is. Otherwise map the fields, e.g.:
 *   return { session_id: r.sessionId, subject: { id: r.patientId, gender: r.sex, ... }, total_body_fat_pct: r.pbf, ... };
 */
function mapBackendResponse(response) {
  return response;
}

/** Converts the backend's "current session" response into { session_id, subject_id }. */
function mapCurrentSession(response) {
  return { session_id: response.session_id ?? response.sessionId, subject_id: response.subject_id ?? response.subjectId ?? '' };
}
