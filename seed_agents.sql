SET app.current_tenant_id = '05603664-7cee-45b8-bb84-ef7cecfd1b79';

-- Customer Success (bu: 53d598e1-6af3-40de-9450-f2ddfb1c8bd7)
-- Gainsight (5c32787b-f223-4b64-b0bc-58d13501bdcd)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','5c32787b-f223-4b64-b0bc-58d13501bdcd','Health Score Monitor','Tracks customer health scores and flags at-risk accounts','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','5c32787b-f223-4b64-b0bc-58d13501bdcd','Renewal Risk Detector','Identifies renewal risks and triggers escalation workflows','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','5c32787b-f223-4b64-b0bc-58d13501bdcd','NPS Analyzer','Aggregates and summarizes NPS survey responses','draft');

-- Zendesk (6fd75692-3353-49aa-931f-b7dde832633f)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','6fd75692-3353-49aa-931f-b7dde832633f','Ticket Triage Agent','Auto-categorizes and routes incoming support tickets','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','6fd75692-3353-49aa-931f-b7dde832633f','SLA Monitor','Alerts when tickets approach SLA breach thresholds','published');

-- Intercom (92944248-c494-4c96-be92-d361201740ce)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','92944248-c494-4c96-be92-d361201740ce','Chat Deflection Agent','Resolves common queries via automated chat responses','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','53d598e1-6af3-40de-9450-f2ddfb1c8bd7','92944248-c494-4c96-be92-d361201740ce','Onboarding Nudge Agent','Sends in-app nudges to guide new users through setup','draft');

-- Data & Analytics (bu: bb06edfd-6ff9-4281-8ec5-3ab6df608031)
-- Snowflake (cad97857-7767-487b-bf04-252ff598f71f)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','bb06edfd-6ff9-4281-8ec5-3ab6df608031','cad97857-7767-487b-bf04-252ff598f71f','Query Cost Optimizer','Analyzes expensive queries and suggests optimizations','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','bb06edfd-6ff9-4281-8ec5-3ab6df608031','cad97857-7767-487b-bf04-252ff598f71f','Data Pipeline Monitor','Monitors pipeline run statuses and alerts on failures','published');

-- Looker (3a6dd2d8-2483-4ac2-8f0c-da4465925e97)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','bb06edfd-6ff9-4281-8ec5-3ab6df608031','3a6dd2d8-2483-4ac2-8f0c-da4465925e97','Dashboard Curator','Identifies stale dashboards and suggests cleanup','draft');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','bb06edfd-6ff9-4281-8ec5-3ab6df608031','3a6dd2d8-2483-4ac2-8f0c-da4465925e97','Metric Anomaly Detector','Detects anomalies in key business metrics','published');

-- dbt (75573e83-22ca-4b29-b7ca-ac0c642f7411)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','bb06edfd-6ff9-4281-8ec5-3ab6df608031','75573e83-22ca-4b29-b7ca-ac0c642f7411','Model Lineage Tracer','Maps upstream/downstream dependencies for dbt models','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','bb06edfd-6ff9-4281-8ec5-3ab6df608031','75573e83-22ca-4b29-b7ca-ac0c642f7411','Test Coverage Agent','Ensures all dbt models have adequate test coverage','draft');

-- Engineering (bu: 51bbf901-f147-4fda-ac95-e44717a77474)
-- GitHub (d7b62987-b5bf-4c56-8676-dafdf33cf5b6)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','d7b62987-b5bf-4c56-8676-dafdf33cf5b6','PR Reviewer','Performs automated code review and flags issues','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','d7b62987-b5bf-4c56-8676-dafdf33cf5b6','Release Notes Generator','Drafts release notes from merged PR descriptions','published');

-- Jira (ed1c354b-9839-4aa3-adf4-77ccc0eb9995)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','ed1c354b-9839-4aa3-adf4-77ccc0eb9995','Sprint Velocity Tracker','Reports on sprint velocity trends and blockers','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','ed1c354b-9839-4aa3-adf4-77ccc0eb9995','Bug Prioritizer','Ranks open bugs by severity and customer impact','draft');

-- Datadog (140cc810-d96b-4c51-80e9-13f101753a89)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','140cc810-d96b-4c51-80e9-13f101753a89','APM Analyzer','Identifies latency regressions in application traces','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','140cc810-d96b-4c51-80e9-13f101753a89','Error Rate Monitor','Alerts on error rate spikes across services','published');

-- PagerDuty (cd8a4fa2-cc23-4abd-a9eb-8b6d14e1e4fa)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','cd8a4fa2-cc23-4abd-a9eb-8b6d14e1e4fa','On-Call Summarizer','Summarizes incident history and suggests runbooks','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','cd8a4fa2-cc23-4abd-a9eb-8b6d14e1e4fa','Incident Router','Routes alerts to the correct on-call team','draft');

-- Sentry (d7e17804-4abb-4ada-82b8-dafe2f70f65e)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','d7e17804-4abb-4ada-82b8-dafe2f70f65e','Error Deduplicator','Groups similar errors and links to root cause PRs','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','51bbf901-f147-4fda-ac95-e44717a77474','d7e17804-4abb-4ada-82b8-dafe2f70f65e','Regression Detector','Flags new errors introduced by recent deployments','published');

-- Executive (bu: 47f3f08c-4d2f-4e8e-9f93-1b53074a1859)
-- Salesforce (545b2d3e-5629-44b3-9471-e76c93970afe)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','47f3f08c-4d2f-4e8e-9f93-1b53074a1859','545b2d3e-5629-44b3-9471-e76c93970afe','Pipeline Health Agent','Surfaces pipeline health and forecast vs target gaps','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','47f3f08c-4d2f-4e8e-9f93-1b53074a1859','545b2d3e-5629-44b3-9471-e76c93970afe','Board Report Agent','Compiles quarterly board-level metrics summary','draft');

-- Tableau (626d2c28-a260-496a-9a0f-c7a02b6c0fe9)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','47f3f08c-4d2f-4e8e-9f93-1b53074a1859','626d2c28-a260-496a-9a0f-c7a02b6c0fe9','KPI Dashboard Agent','Keeps executive KPI dashboards updated and annotated','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','47f3f08c-4d2f-4e8e-9f93-1b53074a1859','626d2c28-a260-496a-9a0f-c7a02b6c0fe9','Data Quality Watchdog','Detects and reports stale or incorrect data in reports','draft');

-- Finance (bu: d20dde72-180b-454b-82a6-f5240de727c1)
-- NetSuite (5721dc51-5863-4c84-9bdc-75857e9ecd7e)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','5721dc51-5863-4c84-9bdc-75857e9ecd7e','Month-End Close Agent','Coordinates and tracks month-end close tasks','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','5721dc51-5863-4c84-9bdc-75857e9ecd7e','Revenue Recognition Agent','Flags deferred revenue items for manual review','published');

-- Workday / Finance (2dc157e9-7d40-46aa-80bc-79464044a57c)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','2dc157e9-7d40-46aa-80bc-79464044a57c','Budget Variance Analyzer','Compares actuals vs budget and explains variances','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','2dc157e9-7d40-46aa-80bc-79464044a57c','Headcount Cost Monitor','Tracks headcount costs against approved plan','draft');

-- Coupa / Finance (599a66a4-bd3d-4e57-a19c-13454f236883)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','599a66a4-bd3d-4e57-a19c-13454f236883','PO Approval Agent','Routes purchase orders to the correct approvers','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','599a66a4-bd3d-4e57-a19c-13454f236883','Spend Anomaly Detector','Identifies unusual spend patterns across categories','draft');

-- Anaplan (b57efa35-86d2-4b63-9029-7df227e687e7)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','b57efa35-86d2-4b63-9029-7df227e687e7','Forecast Sync Agent','Keeps Anaplan models in sync with latest actuals','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d20dde72-180b-454b-82a6-f5240de727c1','b57efa35-86d2-4b63-9029-7df227e687e7','Scenario Planner','Runs what-if scenarios for headcount and revenue','draft');

-- HR (bu: 6a645473-cb2f-4b17-80ba-0c1d8c7b1496)
-- Workday / HR (d09d906b-5b03-45c6-9412-866bbc68b120)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','6a645473-cb2f-4b17-80ba-0c1d8c7b1496','d09d906b-5b03-45c6-9412-866bbc68b120','Onboarding Coordinator','Automates new-hire onboarding task assignments','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','6a645473-cb2f-4b17-80ba-0c1d8c7b1496','d09d906b-5b03-45c6-9412-866bbc68b120','Time-Off Compliance Agent','Flags policy violations in time-off requests','draft');

-- Greenhouse (cae6a372-2073-40be-988e-d5d9eb0a8936)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','6a645473-cb2f-4b17-80ba-0c1d8c7b1496','cae6a372-2073-40be-988e-d5d9eb0a8936','Interview Scheduler','Coordinates interview slots across hiring teams','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','6a645473-cb2f-4b17-80ba-0c1d8c7b1496','cae6a372-2073-40be-988e-d5d9eb0a8936','Candidate Screener','Scores resumes against job requirements','published');

-- Lattice / HR (6f3cf37e-6923-4813-896c-5bc4bd000f69)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','6a645473-cb2f-4b17-80ba-0c1d8c7b1496','6f3cf37e-6923-4813-896c-5bc4bd000f69','Performance Review Agent','Drafts performance review summaries from check-in data','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','6a645473-cb2f-4b17-80ba-0c1d8c7b1496','6f3cf37e-6923-4813-896c-5bc4bd000f69','OKR Alignment Monitor','Checks individual OKRs against company goals','draft');

-- IT (bu: 1fa029a7-cec3-4b45-a9d1-53a565658dbe)
-- ServiceNow (8b6015aa-bfd3-4f7e-8875-dd0356289986)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','8b6015aa-bfd3-4f7e-8875-dd0356289986','IT Help Desk Agent','Handles tier-1 IT support requests automatically','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','8b6015aa-bfd3-4f7e-8875-dd0356289986','Change Risk Assessor','Evaluates change requests for risk before approval','published');

-- Okta (f16ae4f0-da0c-4edf-9c32-e7ec9bd2b28c)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','f16ae4f0-da0c-4edf-9c32-e7ec9bd2b28c','Access Provisioner','Automates user access provisioning and deprovisioning','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','f16ae4f0-da0c-4edf-9c32-e7ec9bd2b28c','MFA Compliance Monitor','Ensures all users have MFA enabled per policy','draft');

-- Datadog / IT (40eefcec-00da-477e-896a-dc26c174c1a2)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','40eefcec-00da-477e-896a-dc26c174c1a2','Infrastructure Monitor','Tracks server and cloud resource health metrics','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','40eefcec-00da-477e-896a-dc26c174c1a2','Cost Optimization Agent','Identifies idle cloud resources and rightsizing opportunities','draft');

-- CrowdStrike (cc11115f-2cf9-4f8d-baff-8f725cdaf33b)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','cc11115f-2cf9-4f8d-baff-8f725cdaf33b','Threat Detector','Analyzes endpoint alerts and escalates critical threats','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','cc11115f-2cf9-4f8d-baff-8f725cdaf33b','Vulnerability Scanner','Reports on unpatched CVEs across the endpoint fleet','published');

-- AWS (4d142c58-86df-4966-8044-11ecabfbb41e)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','4d142c58-86df-4966-8044-11ecabfbb41e','Cloud Cost Agent','Monitors AWS spend and forecasts monthly bill','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','1fa029a7-cec3-4b45-a9d1-53a565658dbe','4d142c58-86df-4966-8044-11ecabfbb41e','IAM Auditor','Reviews IAM policies for overly permissive access','draft');

-- Legal (bu: 69934d4e-d6dd-4a53-9838-42962b0426fd)
-- DocuSign (22de2f63-d898-41c4-8f48-059d1ff51af5)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','69934d4e-d6dd-4a53-9838-42962b0426fd','22de2f63-d898-41c4-8f48-059d1ff51af5','Contract Routing Agent','Routes contracts to correct signatories automatically','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','69934d4e-d6dd-4a53-9838-42962b0426fd','22de2f63-d898-41c4-8f48-059d1ff51af5','Expiry Alert Agent','Warns on contracts approaching expiration dates','published');

-- Ironclad (86e0d6fc-8ebd-4878-9c7e-c577fb424ddf)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','69934d4e-d6dd-4a53-9838-42962b0426fd','86e0d6fc-8ebd-4878-9c7e-c577fb424ddf','Redline Reviewer','Flags non-standard clauses in incoming contracts','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','69934d4e-d6dd-4a53-9838-42962b0426fd','86e0d6fc-8ebd-4878-9c7e-c577fb424ddf','Obligation Tracker','Tracks contractual obligations and deadlines','draft');

-- ContractPodAi (88ecf10c-1ed7-47cf-9d1d-6299530d6b14)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','69934d4e-d6dd-4a53-9838-42962b0426fd','88ecf10c-1ed7-47cf-9d1d-6299530d6b14','AI Contract Summarizer','Generates plain-language summaries of legal agreements','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','69934d4e-d6dd-4a53-9838-42962b0426fd','88ecf10c-1ed7-47cf-9d1d-6299530d6b14','Compliance Checker','Validates contracts against internal policy templates','draft');

-- Marketing (bu: d98f93d5-2982-4d37-9169-3857877a1759)
-- Marketo (2f574203-0777-43bf-81ce-b3317bf8673f)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','2f574203-0777-43bf-81ce-b3317bf8673f','Lead Score Optimizer','Tunes lead scoring models based on conversion data','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','2f574203-0777-43bf-81ce-b3317bf8673f','Campaign Performance Agent','Reports on email campaign open and click-through rates','published');

-- HubSpot (26fec1ce-4b71-47ba-9278-ffb446c714c5)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','26fec1ce-4b71-47ba-9278-ffb446c714c5','Contact Enrichment Agent','Enriches contact records with firmographic data','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','26fec1ce-4b71-47ba-9278-ffb446c714c5','Workflow Automation Agent','Monitors and optimizes marketing automation workflows','draft');

-- 6sense (353519fa-8495-4e1a-b17f-4fc032535110)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','353519fa-8495-4e1a-b17f-4fc032535110','Intent Signal Monitor','Surfaces accounts showing high buying intent','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','353519fa-8495-4e1a-b17f-4fc032535110','ABM Prioritizer','Ranks target accounts by predicted deal likelihood','draft');

-- Sprinklr (a067cd87-69e9-466b-bc0e-0259138ada99)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','a067cd87-69e9-466b-bc0e-0259138ada99','Social Sentiment Tracker','Monitors brand sentiment across social channels','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','d98f93d5-2982-4d37-9169-3857877a1759','a067cd87-69e9-466b-bc0e-0259138ada99','Content Scheduler','Optimizes post timing based on engagement analytics','draft');

-- Operations (bu: b99ff27a-7d0a-4896-a219-33b7cd186877)
-- Monday.com (fad1a273-cc16-4c56-a410-a8f9f1d463c0)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','b99ff27a-7d0a-4896-a219-33b7cd186877','fad1a273-cc16-4c56-a410-a8f9f1d463c0','Project Status Agent','Generates weekly status reports from board data','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','b99ff27a-7d0a-4896-a219-33b7cd186877','fad1a273-cc16-4c56-a410-a8f9f1d463c0','Deadline Alert Agent','Notifies teams of overdue tasks and blockers','draft');

-- Asana (fcdc3399-bc9d-44f7-9269-5625fa33ba74)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','b99ff27a-7d0a-4896-a219-33b7cd186877','fcdc3399-bc9d-44f7-9269-5625fa33ba74','Task Dependency Mapper','Identifies critical path tasks and dependency risks','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','b99ff27a-7d0a-4896-a219-33b7cd186877','fcdc3399-bc9d-44f7-9269-5625fa33ba74','Capacity Planner','Balances workload across team members','draft');

-- Workato (b5f9a7fd-0711-4075-8fcf-96d822f40b33)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','b99ff27a-7d0a-4896-a219-33b7cd186877','b5f9a7fd-0711-4075-8fcf-96d822f40b33','Integration Health Monitor','Tracks recipe run success rates and error patterns','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','b99ff27a-7d0a-4896-a219-33b7cd186877','b5f9a7fd-0711-4075-8fcf-96d822f40b33','Automation Auditor','Reviews automation recipes for redundancy and gaps','draft');

-- People Ops (bu: 039402bf-55d1-4611-9711-b0967391eff3)
-- Rippling (45b8bb69-348b-426e-b867-f4695231e018)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','45b8bb69-348b-426e-b867-f4695231e018','Payroll Audit Agent','Cross-checks payroll runs against approved headcount','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','45b8bb69-348b-426e-b867-f4695231e018','Benefits Enrollment Monitor','Tracks open enrollment completion rates by team','draft');

-- BambooHR (efb64e38-e5ff-467e-a242-62b546db0235)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','efb64e38-e5ff-467e-a242-62b546db0235','Org Chart Updater','Keeps org chart current with headcount changes','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','efb64e38-e5ff-467e-a242-62b546db0235','Attrition Risk Agent','Identifies flight risk employees from engagement signals','draft');

-- Lattice / People Ops (c5d03fe3-494a-410a-941a-621390088a1f)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','c5d03fe3-494a-410a-941a-621390088a1f','Engagement Survey Analyzer','Summarizes engagement survey results by department','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','c5d03fe3-494a-410a-941a-621390088a1f','Growth Plan Agent','Drafts individual development plans from review data','draft');

-- Deel (8c062f07-0fb1-497c-9f6c-aaa937bac272)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','8c062f07-0fb1-497c-9f6c-aaa937bac272','Global Compliance Agent','Monitors contractor compliance across jurisdictions','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','039402bf-55d1-4611-9711-b0967391eff3','8c062f07-0fb1-497c-9f6c-aaa937bac272','Contractor Offboarding Agent','Automates contractor offboarding and access revocation','draft');

-- Procurement (bu: 25a7ca56-ace7-414d-89d6-da373f6fd819)
-- Coupa / Procurement (7abc82d7-a8b3-48d2-8917-db75ddfcb078)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','25a7ca56-ace7-414d-89d6-da373f6fd819','7abc82d7-a8b3-48d2-8917-db75ddfcb078','Supplier Risk Monitor','Assesses supplier risk based on financial and delivery data','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','25a7ca56-ace7-414d-89d6-da373f6fd819','7abc82d7-a8b3-48d2-8917-db75ddfcb078','Spend Category Agent','Categorizes uncoded spend and routes for approval','draft');

-- SAP Ariba (d2418489-3450-4fb5-8205-4f269d7db28e)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','25a7ca56-ace7-414d-89d6-da373f6fd819','d2418489-3450-4fb5-8205-4f269d7db28e','RFP Coordinator','Manages RFP distribution and vendor response tracking','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','25a7ca56-ace7-414d-89d6-da373f6fd819','d2418489-3450-4fb5-8205-4f269d7db28e','Contract Renewal Agent','Alerts on expiring supplier contracts ahead of renewal','draft');

-- Zip (06ca6575-414c-472f-addb-ab8a7b23f02c)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','25a7ca56-ace7-414d-89d6-da373f6fd819','06ca6575-414c-472f-addb-ab8a7b23f02c','Intake Triage Agent','Routes new intake requests to the right approver chain','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','25a7ca56-ace7-414d-89d6-da373f6fd819','06ca6575-414c-472f-addb-ab8a7b23f02c','Vendor Onboarding Agent','Automates vendor setup and compliance documentation','draft');

-- Product (bu: 8a42c229-8263-4e59-801c-61f82f88fb33)
-- Jira / Product (45556700-dd5b-4965-a790-42ab42fde504)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','45556700-dd5b-4965-a790-42ab42fde504','Roadmap Drift Detector','Flags epics that have slipped from the committed roadmap','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','45556700-dd5b-4965-a790-42ab42fde504','Backlog Grooming Agent','Prioritizes and estimates backlog items using AI','draft');

-- Figma (a2e3765c-8b25-4df4-b954-5a75bf975f8a)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','a2e3765c-8b25-4df4-b954-5a75bf975f8a','Design Token Auditor','Ensures design tokens are consistently applied across files','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','a2e3765c-8b25-4df4-b954-5a75bf975f8a','Accessibility Checker','Scans designs for WCAG accessibility violations','draft');

-- Amplitude (ef12b28d-19e1-47cc-b9bd-c87dd50d318c)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','ef12b28d-19e1-47cc-b9bd-c87dd50d318c','Feature Adoption Monitor','Tracks feature adoption rates post-launch','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','ef12b28d-19e1-47cc-b9bd-c87dd50d318c','Funnel Drop-off Analyzer','Identifies where users abandon conversion funnels','published');

-- Productboard (8194987b-509f-48c7-a13f-1d991af1e9c2)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','8194987b-509f-48c7-a13f-1d991af1e9c2','Customer Feedback Tagger','Tags and categorizes incoming product feedback','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','8194987b-509f-48c7-a13f-1d991af1e9c2','Feature Request Ranker','Scores feature requests by strategic value and demand','draft');

-- Pendo (41e80a0e-c236-4a91-97a1-557f334d8f2a)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','41e80a0e-c236-4a91-97a1-557f334d8f2a','In-App Guide Agent','Triggers contextual in-app guides based on user behavior','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','8a42c229-8263-4e59-801c-61f82f88fb33','41e80a0e-c236-4a91-97a1-557f334d8f2a','Retention Cohort Analyzer','Compares retention curves across product cohorts','draft');

-- RevOps (bu: 79ab4b5e-9f2a-43d9-a594-2ba93d70621c)
-- Salesforce / RevOps (7691821e-cda6-4d1d-8b77-afa42f6273c8)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','7691821e-cda6-4d1d-8b77-afa42f6273c8','CRM Data Quality Agent','Detects duplicate and stale CRM records','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','7691821e-cda6-4d1d-8b77-afa42f6273c8','Territory Optimizer','Rebalances sales territories based on pipeline capacity','draft');

-- Clari / RevOps (f779212e-230b-4944-b70c-4afc60778e6d)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','f779212e-230b-4944-b70c-4afc60778e6d','Forecast Accuracy Agent','Tracks rep forecast accuracy and highlights outliers','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','f779212e-230b-4944-b70c-4afc60778e6d','Deal Risk Scorer','Assigns risk scores to open opportunities','published');

-- LeanData (f00c145f-95e2-49e1-b9f2-f61c2794dc9a)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','f00c145f-95e2-49e1-b9f2-f61c2794dc9a','Lead Routing Agent','Routes inbound leads to the correct owner per rules','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','f00c145f-95e2-49e1-b9f2-f61c2794dc9a','Account Matching Agent','Deduplicates and merges incoming lead-to-account matches','draft');

-- Outreach / RevOps (37ab9f42-545f-4282-abf2-f7809c213ef1)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','37ab9f42-545f-4282-abf2-f7809c213ef1','Sequence Performance Agent','Analyzes sequence reply and meeting booking rates','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','79ab4b5e-9f2a-43d9-a594-2ba93d70621c','37ab9f42-545f-4282-abf2-f7809c213ef1','Email Compliance Monitor','Ensures outbound sequences follow opt-out regulations','draft');

-- Sales (bu: c72eebcb-03bc-4df0-b0a9-a49e039fe29f)
-- Salesforce / Sales (63af213f-6e65-4762-baac-d42c12cb65e9)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','63af213f-6e65-4762-baac-d42c12cb65e9','Quota Forecaster','Projects quota attainment for reps and teams','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','63af213f-6e65-4762-baac-d42c12cb65e9','Pipeline Coverage Agent','Ensures sufficient pipeline coverage against quota','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','63af213f-6e65-4762-baac-d42c12cb65e9','SPIF Optimizer','Designs and tracks SPIF incentives for target products','draft');

-- Gong (c86ea422-f0d9-4cc3-bbb1-e042f4035117)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','c86ea422-f0d9-4cc3-bbb1-e042f4035117','Call Coach Agent','Surfaces coaching moments from recorded sales calls','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','c86ea422-f0d9-4cc3-bbb1-e042f4035117','Win/Loss Analyzer','Identifies patterns in won and lost opportunities','published');

-- Outreach / Sales (959adb4f-ccdb-457d-bbc0-4a5623c9d285)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','959adb4f-ccdb-457d-bbc0-4a5623c9d285','Prospecting Agent','Generates personalized outreach based on account signals','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','959adb4f-ccdb-457d-bbc0-4a5623c9d285','Follow-Up Reminder Agent','Reminds reps to follow up on stale open opportunities','draft');

-- ZoomInfo (a84a7f74-81d7-41dc-8403-b12b3fd6092e)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','a84a7f74-81d7-41dc-8403-b12b3fd6092e','ICP Fit Scorer','Scores inbound leads against ideal customer profile','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','a84a7f74-81d7-41dc-8403-b12b3fd6092e','Contact Data Freshness Agent','Flags stale contact data and triggers re-enrichment','draft');

-- Clari / Sales (899fb04d-63bf-41dc-87c7-1de57bcbb200)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','899fb04d-63bf-41dc-87c7-1de57bcbb200','Commit Confidence Agent','Validates rep commits against historical accuracy','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','c72eebcb-03bc-4df0-b0a9-a49e039fe29f','899fb04d-63bf-41dc-87c7-1de57bcbb200','Clawback Detector','Identifies deals at risk of chargeback or clawback','published');

-- Support (bu: ee17ef51-30a8-484f-8c42-5407d95010e7)
-- Zendesk / Support (9b8afc21-7bb1-450e-8911-23dd12574e9b)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','9b8afc21-7bb1-450e-8911-23dd12574e9b','Support Admin Agent','Manages views, macros, and triggers in Zendesk','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','9b8afc21-7bb1-450e-8911-23dd12574e9b','CSAT Monitor','Tracks CSAT trends and flags declining satisfaction','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','9b8afc21-7bb1-450e-8911-23dd12574e9b','Escalation Handler','Routes escalated tickets to senior agents automatically','draft');

-- Intercom / Support (d26312a2-7fab-4a03-bd7e-440c64ebb29e)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','d26312a2-7fab-4a03-bd7e-440c64ebb29e','Bot Builder Agent','Creates and optimizes resolution bots for common issues','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','d26312a2-7fab-4a03-bd7e-440c64ebb29e','Proactive Support Agent','Reaches out to users before they submit a ticket','draft');

-- Freshdesk (c8945efb-4fae-4324-8c75-cd0add1301fe)
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','c8945efb-4fae-4324-8c75-cd0add1301fe','Ticket Merge Agent','Merges duplicate tickets from the same customer','published');
INSERT INTO agents (tenant_id, business_unit_id, group_id, name, description, status)
VALUES ('05603664-7cee-45b8-bb84-ef7cecfd1b79','ee17ef51-30a8-484f-8c42-5407d95010e7','c8945efb-4fae-4324-8c75-cd0add1301fe','Knowledge Base Agent','Suggests help articles from unresolved ticket patterns','draft');

SELECT count(*) AS total_agents FROM agents;
