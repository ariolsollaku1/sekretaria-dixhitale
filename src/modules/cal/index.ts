// Public surface of the CAL module: other code imports only from here.
import "./permissions";
export { registerAudienceResolver, type Audience } from "./server/audience";
export { listEvents, getEvent, feedEvents, type EventView } from "./server/event.queries";
