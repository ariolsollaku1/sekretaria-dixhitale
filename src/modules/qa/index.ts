// Public surface of the QA module: other code imports only from here.
import "./permissions";
export {
  listCampaigns,
  getCampaign,
  type CampaignRow,
  type CampaignDetail,
  type ParticipationRow,
} from "./server/campaign.queries";
export {
  ownSurveys,
  surveyForm,
  ADMIN_TARGET,
  type OpenSurvey,
  type SurveyForm,
  type SurveyTarget,
} from "./server/survey.queries";
export {
  campaignResults,
  targetResults,
  listResultCampaigns,
  getMinResponses,
  type CampaignResults,
  type TargetDetail,
  type AssignmentResultRow,
} from "./server/result.queries";
export { CampaignForm } from "./ui/campaign-form";
export { CampaignActions } from "./ui/campaign-actions";
export { QuestionEditor } from "./ui/question-editor";
export { SurveyFormView } from "./ui/survey-form";
export { ResultFigures } from "./ui/result-figures";
export type { Question, Section } from "./domain/question-rules";
export type { TargetResult } from "./domain/result-rules";
