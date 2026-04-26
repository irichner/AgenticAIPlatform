"""
Seed script: creates the Production tenant with 16 departments, application
swarms (AgentGroups), and persona Agents.

Usage (from repo root, with Docker or local Postgres running):
    cd backend
    python seed_prod.py

The lanara DB user is the table owner and bypasses RLS by default, so no
SET LOCAL app.current_tenant_id is needed here.
"""
from __future__ import annotations
import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# Must be set before importing engine so DATABASE_URL is available
from app.db.engine import AsyncSessionLocal
from app.models.business_unit import BusinessUnit
from app.models.agent_group import AgentGroup
from app.models.agent import Agent, AgentVersion

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

# Each department has a list of swarms (application agent groups).
# Each swarm has a list of (persona_name, description) tuples.
DEPARTMENTS: list[dict] = [
    {
        "name": "Sales",
        "description": "Direct revenue generation, quota attainment, and pipeline management.",
        "swarms": [
            {
                "app": "Salesforce",
                "description": "CRM pipeline and opportunity management swarm.",
                "personas": [
                    ("Opportunity Analyst", "Analyzes open opportunities for deal health and next-best-action."),
                    ("Pipeline Coach", "Surfaces pipeline gaps and coaching opportunities for reps."),
                    ("Forecast Accuracy Monitor", "Tracks commit vs. best-case vs. worst-case on a rolling basis."),
                    ("Account Health Watcher", "Monitors account signals for expansion or churn risk."),
                ],
            },
            {
                "app": "Gong",
                "description": "Revenue intelligence and call analytics swarm.",
                "personas": [
                    ("Call Summarizer", "Auto-generates structured call summaries with action items."),
                    ("Deal Risk Detector", "Flags deals with negative momentum from conversation signals."),
                    ("Coaching Recommender", "Identifies skill gaps and recommends targeted rep coaching."),
                    ("Competitive Intel Agent", "Tracks competitor mentions across calls and surfaces trends."),
                ],
            },
            {
                "app": "Outreach",
                "description": "Sales engagement and sequence optimization swarm.",
                "personas": [
                    ("Sequence Optimizer", "A/B tests email subject lines and step timings for higher reply rates."),
                    ("Reply Analyzer", "Classifies replies and routes prospects to the right follow-up sequence."),
                    ("Persona Tuner", "Adapts messaging for different buyer personas and verticals."),
                ],
            },
            {
                "app": "Clari",
                "description": "Revenue forecasting and deal inspection swarm.",
                "personas": [
                    ("Revenue Forecaster", "Generates AI-driven forecast with confidence intervals."),
                    ("Deal Inspector", "Deep-dives on at-risk deals and suggests remediation actions."),
                    ("Rep Performance Tracker", "Monitors individual rep attainment vs. quota trend."),
                ],
            },
            {
                "app": "ZoomInfo",
                "description": "B2B data enrichment and prospecting swarm.",
                "personas": [
                    ("Prospect Finder", "Identifies net-new prospects matching the ideal customer profile."),
                    ("ICP Matcher", "Scores inbound leads against ideal customer profile criteria."),
                    ("Data Refresher", "Keeps CRM contact and account records current and accurate."),
                ],
            },
        ],
    },
    {
        "name": "Marketing",
        "description": "Demand generation, brand awareness, and pipeline sourcing.",
        "swarms": [
            {
                "app": "Marketo",
                "description": "Marketing automation and lead lifecycle management swarm.",
                "personas": [
                    ("Campaign Optimizer", "Tunes campaign parameters to maximize MQL conversion rates."),
                    ("Lead Nurture Builder", "Designs multi-touch nurture programs per audience segment."),
                    ("Attribution Analyst", "Tracks first- and multi-touch attribution across all channels."),
                ],
            },
            {
                "app": "Google Ads",
                "description": "Paid search and performance marketing optimization swarm.",
                "personas": [
                    ("Bid Optimizer", "Adjusts keyword bids in real time based on conversion signals."),
                    ("Keyword Researcher", "Discovers high-intent search terms for campaign expansion."),
                    ("ROAS Analyzer", "Monitors return on ad spend by campaign and audience segment."),
                ],
            },
            {
                "app": "Drift",
                "description": "Conversational marketing and chatbot optimization swarm.",
                "personas": [
                    ("Chatbot Tuner", "Improves playbook responses and routing for higher booking rates."),
                    ("Conversation Analyst", "Surfaces winning conversation patterns from closed-won deals."),
                    ("Lead Router", "Routes qualified conversations to the right rep instantly."),
                ],
            },
            {
                "app": "Sprout Social",
                "description": "Social media management and brand monitoring swarm.",
                "personas": [
                    ("Brand Monitor", "Tracks brand mentions and sentiment across social networks."),
                    ("Engagement Tracker", "Measures content performance and audience interaction rates."),
                    ("Post Scheduler", "Optimizes publishing schedules by audience timezone and behavior."),
                ],
            },
        ],
    },
    {
        "name": "Finance",
        "description": "Financial planning, reporting, close management, and compliance.",
        "swarms": [
            {
                "app": "NetSuite",
                "description": "ERP financial operations and period-close management swarm.",
                "personas": [
                    ("GL Reconciler", "Automates general ledger reconciliation at period end."),
                    ("Expense Auditor", "Flags policy violations and duplicate entries in expense reports."),
                    ("Close Process Monitor", "Tracks task completion against the financial close calendar."),
                ],
            },
            {
                "app": "Anaplan",
                "description": "Connected planning and financial modeling swarm.",
                "personas": [
                    ("Model Validator", "Detects broken formulas and model inconsistencies in Anaplan."),
                    ("Scenario Planner", "Runs bull/base/bear scenarios and summarizes key deltas."),
                    ("Driver-Based Forecast Agent", "Links business drivers to financial outcomes in the model."),
                ],
            },
            {
                "app": "Stripe",
                "description": "Revenue recognition and billing operations swarm.",
                "personas": [
                    ("Revenue Recognizer", "Applies ASC 606 rules to deferred revenue schedules automatically."),
                    ("Churn Predictor", "Flags accounts at risk of involuntary churn via failed payment signals."),
                    ("Dunning Optimizer", "Adjusts retry cadence and messaging to recover failed payments."),
                ],
            },
            {
                "app": "Workday Financials",
                "description": "Financial management, budgeting, and compliance swarm.",
                "personas": [
                    ("Budget Variance Detector", "Alerts on material variances relative to approved budget."),
                    ("Compliance Checker", "Validates transactions against spend and procurement policy."),
                    ("Headcount Cost Analyzer", "Tracks actual vs. plan for all people-related cost lines."),
                ],
            },
        ],
    },
    {
        "name": "Human Resources",
        "description": "Talent acquisition, employee experience, and workforce planning.",
        "swarms": [
            {
                "app": "Workday HCM",
                "description": "Core HR operations and workforce management swarm.",
                "personas": [
                    ("Onboarding Orchestrator", "Automates new-hire task sequences across departments."),
                    ("Attrition Predictor", "Identifies retention risk before employees disengage."),
                    ("Compensation Benchmarker", "Compares total comp packages against external market bands."),
                ],
            },
            {
                "app": "Greenhouse",
                "description": "Applicant tracking and recruiting operations swarm.",
                "personas": [
                    ("Recruiter Assistant", "Summarizes candidate profiles and suggests interview questions."),
                    ("JD Optimizer", "Rewrites job descriptions for clarity, accuracy, and inclusion."),
                    ("Candidate Ranker", "Scores applicants against defined role requirements."),
                ],
            },
            {
                "app": "Lattice",
                "description": "Performance management and employee engagement swarm.",
                "personas": [
                    ("OKR Tracker", "Monitors goal progress and surfaces blockers early."),
                    ("Engagement Analyzer", "Identifies recurring themes from employee survey responses."),
                    ("Performance Reviewer", "Drafts calibration talking points from structured review data."),
                ],
            },
            {
                "app": "LinkedIn Talent",
                "description": "Talent sourcing and workforce intelligence swarm.",
                "personas": [
                    ("Talent Sourcer", "Builds targeted candidate lists from LinkedIn profile signals."),
                    ("Skills Gap Analyzer", "Compares current workforce skills to future role requirements."),
                    ("Diversity Tracker", "Monitors pipeline diversity metrics by role, level, and team."),
                ],
            },
        ],
    },
    {
        "name": "Engineering",
        "description": "Product engineering, infrastructure, and technical delivery.",
        "swarms": [
            {
                "app": "GitHub",
                "description": "Code review, quality gate, and release management swarm.",
                "personas": [
                    ("PR Reviewer", "Provides automated code review feedback on open pull requests."),
                    ("Code Quality Monitor", "Tracks coverage, complexity, and lint violations over time."),
                    ("Release Note Generator", "Drafts release notes from merged PR titles and descriptions."),
                ],
            },
            {
                "app": "Jira",
                "description": "Sprint planning and delivery tracking swarm.",
                "personas": [
                    ("Sprint Planner", "Balances sprint capacity against story points and team velocity."),
                    ("Blocker Detector", "Surfaces impediments from ticket comments and status changes."),
                    ("Velocity Analyzer", "Tracks team throughput and highlights unexpected scope creep."),
                ],
            },
            {
                "app": "PagerDuty",
                "description": "Incident management and on-call schedule optimization swarm.",
                "personas": [
                    ("Incident Responder", "Coordinates response, escalations, and stakeholder communications."),
                    ("On-Call Optimizer", "Balances on-call load and suggests schedule improvements."),
                    ("Post-Mortem Writer", "Auto-drafts incident retrospectives from timeline and log data."),
                ],
            },
            {
                "app": "Datadog",
                "description": "Observability, SLO tracking, and cost attribution swarm.",
                "personas": [
                    ("Anomaly Detector", "Alerts on metric deviations before they become customer incidents."),
                    ("SLO Monitor", "Tracks error budget consumption against service-level objectives."),
                    ("Alert Tuner", "Reduces alert noise by refining thresholds and conditions."),
                    ("Cost Attribution Agent", "Maps infrastructure spend to teams and individual services."),
                ],
            },
        ],
    },
    {
        "name": "Customer Success",
        "description": "Retention, expansion, and customer health management.",
        "swarms": [
            {
                "app": "Gainsight",
                "description": "Customer health scoring and renewal management swarm.",
                "personas": [
                    ("Health Score Monitor", "Tracks composite health score changes and triggers CS playbooks."),
                    ("Churn Early Warning", "Predicts at-risk accounts 90 days before renewal date."),
                    ("QBR Preparer", "Assembles data-driven quarterly business review slide decks."),
                    ("Expansion Spotter", "Identifies upsell and cross-sell signals from product usage data."),
                ],
            },
            {
                "app": "Totango",
                "description": "Customer lifecycle segmentation and engagement swarm.",
                "personas": [
                    ("Segment Analyzer", "Profiles account cohorts by behavior and revenue value."),
                    ("Lifecycle Coach", "Recommends next-best-action per customer lifecycle stage."),
                    ("Renewal Risk Detector", "Flags contract renewals at risk of downsell or non-renewal."),
                ],
            },
            {
                "app": "ChurnZero",
                "description": "Real-time customer adoption and playbook execution swarm.",
                "personas": [
                    ("Adoption Tracker", "Monitors feature usage against onboarding milestone targets."),
                    ("Playbook Executor", "Triggers and manages automated customer success plays."),
                    ("Executive Sponsor Alert", "Notifies executive sponsors when account health deteriorates."),
                ],
            },
        ],
    },
    {
        "name": "Operations",
        "description": "Business operations, project execution, and process efficiency.",
        "swarms": [
            {
                "app": "Monday.com",
                "description": "Project tracking and cross-team coordination swarm.",
                "personas": [
                    ("Project Status Tracker", "Aggregates project status updates into executive summaries."),
                    ("Dependency Mapper", "Identifies cross-team blockers and critical path delays."),
                    ("Resource Allocator", "Balances workload across teams and surfaces capacity gaps."),
                ],
            },
            {
                "app": "Asana",
                "description": "Work management, milestone tracking, and deadline management swarm.",
                "personas": [
                    ("Milestone Monitor", "Alerts on at-risk milestones before deadlines slip."),
                    ("Workload Balancer", "Redistributes tasks when team members are over capacity."),
                    ("Deadline Alert Bot", "Proactively notifies task owners of upcoming due dates."),
                ],
            },
            {
                "app": "ServiceNow",
                "description": "ITSM request routing and enterprise workflow management swarm.",
                "personas": [
                    ("ITSM Request Router", "Classifies and routes service requests to the correct team."),
                    ("Change Advisory Bot", "Assesses change request risk and recommends approval routing."),
                    ("SLA Monitor", "Tracks ticket resolution times against service-level agreements."),
                ],
            },
            {
                "app": "Notion",
                "description": "Knowledge management and process documentation swarm.",
                "personas": [
                    ("Knowledge Curator", "Identifies and archives outdated internal documentation."),
                    ("SOW Summarizer", "Extracts key obligations and deliverables from statements of work."),
                    ("Process Documenter", "Converts tribal knowledge into structured runbooks and playbooks."),
                ],
            },
        ],
    },
    {
        "name": "Legal",
        "description": "Contract management, compliance, and regulatory risk.",
        "swarms": [
            {
                "app": "Ironclad",
                "description": "Contract lifecycle management and negotiation risk swarm.",
                "personas": [
                    ("Contract Redline Analyzer", "Compares counterparty redlines against the standard playbook."),
                    ("Clause Risk Scorer", "Scores non-standard clauses by legal and business risk level."),
                    ("Obligation Tracker", "Monitors contract obligations and milestone deadlines post-signature."),
                ],
            },
            {
                "app": "DocuSign",
                "description": "Electronic signature workflow and document management swarm.",
                "personas": [
                    ("Signature Status Monitor", "Tracks pending signatures and auto-reminds signers on schedule."),
                    ("Document Classifier", "Categorizes executed agreements by type and jurisdiction."),
                    ("Expiry Alert Agent", "Warns on upcoming contract expirations requiring proactive renewal."),
                ],
            },
            {
                "app": "LexisNexis",
                "description": "Legal research and regulatory intelligence swarm.",
                "personas": [
                    ("Regulatory Update Tracker", "Monitors new regulations relevant to business operations."),
                    ("Case Law Summarizer", "Distills relevant case law into actionable precedent notes."),
                    ("Compliance Risk Reporter", "Generates periodic regulatory compliance status reports."),
                ],
            },
        ],
    },
    {
        "name": "IT & Infrastructure",
        "description": "Technology infrastructure, identity management, and cybersecurity.",
        "swarms": [
            {
                "app": "Okta",
                "description": "Identity and access management swarm.",
                "personas": [
                    ("Access Review Bot", "Automates quarterly user access certification campaigns."),
                    ("Suspicious Login Detector", "Flags anomalous authentication patterns in real time."),
                    ("Provisioning Orchestrator", "Manages app access grants and revocations via SCIM."),
                ],
            },
            {
                "app": "AWS",
                "description": "Cloud infrastructure management and cost optimization swarm.",
                "personas": [
                    ("Cost Optimizer", "Identifies idle resources and recommends rightsizing actions."),
                    ("Security Posture Checker", "Scans for misconfigurations against CIS benchmarks."),
                    ("Resource Right-Sizer", "Recommends instance type changes based on utilization trends."),
                    ("FinOps Analyst", "Allocates cloud spend to cost centers and tracks budget variance."),
                ],
            },
            {
                "app": "CrowdStrike",
                "description": "Endpoint protection and threat detection swarm.",
                "personas": [
                    ("Threat Hunt Agent", "Proactively searches endpoints for indicators of compromise."),
                    ("Endpoint Analyzer", "Triages endpoint detections and escalates critical security events."),
                    ("Incident Classifier", "Categorizes security events by severity and required response type."),
                ],
            },
            {
                "app": "Terraform",
                "description": "Infrastructure-as-code governance and compliance validation swarm.",
                "personas": [
                    ("Drift Detector", "Identifies infrastructure drift from approved Terraform state."),
                    ("IaC Reviewer", "Validates Terraform plans against security and cost policies."),
                    ("Compliance Validator", "Ensures infrastructure changes meet SOC2 and ISO27001 controls."),
                ],
            },
        ],
    },
    {
        "name": "Revenue Operations",
        "description": "End-to-end go-to-market process, tooling alignment, and performance management.",
        "swarms": [
            {
                "app": "Clari RevOps",
                "description": "Forecast management and pipeline analytics swarm.",
                "personas": [
                    ("Forecast Accuracy Tracker", "Measures forecast vs. actual deviation by rep and segment."),
                    ("Pipeline Coverage Analyzer", "Tracks pipeline coverage ratios against quota targets."),
                    ("Rep Coaching Bot", "Identifies coaching opportunities from forecast submission patterns."),
                ],
            },
            {
                "app": "LeanData",
                "description": "Lead routing, territory management, and attribution swarm.",
                "personas": [
                    ("Lead Router", "Routes inbound leads to the right rep or queue in real time."),
                    ("BDR Coverage Monitor", "Ensures BDR territory coverage and follow-up SLA compliance."),
                    ("Attribution Model Builder", "Constructs and validates multi-touch attribution models."),
                ],
            },
            {
                "app": "Tableau",
                "description": "Business intelligence governance and reporting swarm.",
                "personas": [
                    ("Dashboard Refresher", "Monitors stale dashboards and triggers scheduled data refresh."),
                    ("Anomaly Spotter", "Surfaces unexpected metric movements for analyst review."),
                    ("Metric Definition Keeper", "Enforces consistent KPI definitions across all dashboards."),
                ],
            },
            {
                "app": "Salesforce RevOps",
                "description": "CRM governance, sales process compliance, and comp validation swarm.",
                "personas": [
                    ("Quote-to-Cash Auditor", "Validates pricing, discounting, and deal desk approval compliance."),
                    ("Territory Modeler", "Analyzes territory balance and recommends realignment scenarios."),
                    ("Comp Plan Validator", "Checks incentive plan design against attainment and pay equity data."),
                ],
            },
            {
                "app": "Gong RevOps",
                "description": "Market intelligence and competitive analysis swarm.",
                "personas": [
                    ("Win/Loss Analyzer", "Identifies patterns across won and lost deals by segment and rep."),
                    ("Talk-Track Optimizer", "Surfaces highest-converting messaging themes from call data."),
                    ("Market Intelligence Agent", "Aggregates competitive signals from calls, reviews, and news."),
                ],
            },
        ],
    },
    {
        "name": "Business Development",
        "description": "Strategic partnerships, new market entry, and alliance development.",
        "swarms": [
            {
                "app": "LinkedIn Sales Navigator",
                "description": "Target account research and executive mapping swarm.",
                "personas": [
                    ("Target Account Researcher", "Builds detailed account dossiers from LinkedIn signals."),
                    ("Decision Maker Mapper", "Identifies buying committee members and influence chains."),
                    ("Signal Tracker", "Monitors job changes, company news, and intent-based growth signals."),
                ],
            },
            {
                "app": "ZoomInfo BizDev",
                "description": "Market intelligence and B2B contact enrichment swarm.",
                "personas": [
                    ("ICP Expander", "Discovers adjacent market segments that match the ICP criteria."),
                    ("Intent Data Analyst", "Prioritizes outreach based on real-time buyer intent signals."),
                    ("Contact Updater", "Refreshes prospect records with verified, current contact details."),
                ],
            },
            {
                "app": "Drift BizDev",
                "description": "Inbound qualification and ABM engagement swarm.",
                "personas": [
                    ("Inbound Lead Router", "Qualifies and routes high-value inbound partnership inquiries."),
                    ("ABM Chat Orchestrator", "Personalizes chatbot conversations for named target accounts."),
                    ("Qualification Bot", "Applies MEDDIC scoring criteria to new business conversations."),
                ],
            },
        ],
    },
    {
        "name": "Procurement",
        "description": "Strategic sourcing, vendor management, and spend governance.",
        "swarms": [
            {
                "app": "Coupa",
                "description": "Spend management and procurement compliance swarm.",
                "personas": [
                    ("PO Approval Router", "Routes purchase orders to the correct approver chain automatically."),
                    ("Spend Compliance Monitor", "Flags off-contract and policy-violating purchases for review."),
                    ("Vendor Risk Scorer", "Assesses supplier financial stability and compliance risk."),
                ],
            },
            {
                "app": "SAP Ariba",
                "description": "Strategic sourcing, RFx management, and supplier contracts swarm.",
                "personas": [
                    ("Sourcing Event Manager", "Manages RFP and RFQ timelines and consolidates supplier responses."),
                    ("Contract Renewal Alert", "Surfaces expiring supplier contracts for proactive renegotiation."),
                    ("Catalog Curator", "Keeps approved product catalogs current, accurate, and compliant."),
                ],
            },
            {
                "app": "Oracle Supply Chain",
                "description": "Demand planning and inventory optimization swarm.",
                "personas": [
                    ("Demand Planner", "Forecasts product demand using sales signals and historical trends."),
                    ("Inventory Optimizer", "Recommends reorder points and safety stock levels by SKU."),
                    ("Lead Time Analyzer", "Tracks supplier lead times and flags emerging delivery delays."),
                ],
            },
        ],
    },
    {
        "name": "Data & Analytics",
        "description": "Data platform engineering, business intelligence, and analytics governance.",
        "swarms": [
            {
                "app": "dbt",
                "description": "Data transformation quality and pipeline governance swarm.",
                "personas": [
                    ("Data Quality Monitor", "Runs dbt tests and alerts on freshness and accuracy failures."),
                    ("Model Documentation Agent", "Auto-generates and maintains dbt model documentation."),
                    ("Test Coverage Tracker", "Identifies untested models and recommends new test cases."),
                ],
            },
            {
                "app": "Snowflake",
                "description": "Cloud data warehouse operations and cost optimization swarm.",
                "personas": [
                    ("Query Optimizer", "Identifies expensive queries and recommends performance improvements."),
                    ("Cost Attribution Agent", "Allocates Snowflake credits to teams, projects, and use cases."),
                    ("Access Auditor", "Reviews data access permissions and flags policy violations."),
                    ("Credit Waste Detector", "Flags idle virtual warehouses and runaway long-running queries."),
                ],
            },
            {
                "app": "Looker",
                "description": "BI semantic layer governance and performance swarm.",
                "personas": [
                    ("Metric Consistency Checker", "Validates KPI definitions across all Looks and Explores."),
                    ("LookML Reviewer", "Reviews LookML changes for correctness and query performance."),
                    ("Embed Performance Agent", "Monitors embedded dashboard load times and end-user usage."),
                ],
            },
            {
                "app": "Fivetran",
                "description": "Data pipeline monitoring and schema change management swarm.",
                "personas": [
                    ("Sync Status Monitor", "Alerts on failed or significantly delayed connector syncs."),
                    ("Schema Change Detector", "Notifies downstream data teams of upstream schema changes."),
                    ("Pipeline Health Checker", "Tracks connector reliability and row-count anomalies over time."),
                ],
            },
        ],
    },
    {
        "name": "Executive Leadership",
        "description": "Strategic planning, board reporting, and company-level decision support.",
        "swarms": [
            {
                "app": "Slack",
                "description": "Executive communication intelligence and signal aggregation swarm.",
                "personas": [
                    ("Executive Briefing Bot", "Compiles a daily digest of critical business signals."),
                    ("Meeting Intelligence Agent", "Extracts action items and key decisions from meeting threads."),
                    ("Decision Logger", "Captures and archives strategic decisions with full context."),
                ],
            },
            {
                "app": "Zoom",
                "description": "Executive meeting intelligence and follow-up management swarm.",
                "personas": [
                    ("Meeting Summarizer", "Generates concise summaries of recorded executive meetings."),
                    ("Action Item Extractor", "Pulls commitments and owners from meeting transcripts."),
                    ("Follow-Up Dispatcher", "Routes action items to owners with deadline reminders."),
                ],
            },
            {
                "app": "Salesforce Exec",
                "description": "Revenue attainment tracking and growth scenario planning swarm.",
                "personas": [
                    ("Revenue Attainment Agent", "Tracks real-time ARR attainment vs. board and investor targets."),
                    ("Headcount Planner", "Models headcount scenarios against revenue and operating margin plans."),
                    ("Market Expansion Analyst", "Evaluates new market TAM estimates and entry readiness."),
                ],
            },
            {
                "app": "Notion Exec",
                "description": "Strategic documentation management and OKR oversight swarm.",
                "personas": [
                    ("Board Report Compiler", "Assembles board deck content from live business metrics."),
                    ("OKR Progress Tracker", "Monitors company-level OKR status and escalates stalled goals."),
                    ("Strategic Plan Monitor", "Tracks execution progress against the annual strategic plan."),
                ],
            },
        ],
    },
    {
        "name": "Customer Support",
        "description": "Technical support ticket resolution, CSAT management, and knowledge operations.",
        "swarms": [
            {
                "app": "Zendesk",
                "description": "Ticket management and support operations efficiency swarm.",
                "personas": [
                    ("Ticket Priority Router", "Classifies and routes tickets by severity and issue type."),
                    ("Macro Recommender", "Suggests the best macro or canned response for each ticket."),
                    ("Knowledge Base Gap Detector", "Identifies missing articles from high-volume ticket topics."),
                ],
            },
            {
                "app": "Intercom",
                "description": "Customer messaging, triage, and satisfaction recovery swarm.",
                "personas": [
                    ("Conversation Triage Agent", "Prioritizes and assigns inbound support conversations."),
                    ("CSAT Follow-up Bot", "Sends targeted follow-ups after low satisfaction score submissions."),
                    ("Escalation Monitor", "Tracks escalated conversations and enforces resolution SLAs."),
                ],
            },
            {
                "app": "Freshdesk",
                "description": "Support desk performance analytics and SLA management swarm.",
                "personas": [
                    ("SLA Breach Predictor", "Flags tickets likely to breach SLA before the deadline arrives."),
                    ("Agent Performance Analyzer", "Tracks CSAT, handle time, and resolution rates per agent."),
                    ("Customer Effort Scorer", "Estimates customer effort level from conversation complexity."),
                ],
            },
            {
                "app": "Guru",
                "description": "Support knowledge accuracy and freshness management swarm.",
                "personas": [
                    ("Answer Accuracy Validator", "Verifies knowledge card accuracy against recent product changes."),
                    ("Knowledge Freshness Checker", "Identifies stale cards needing subject-matter expert review."),
                    ("Usage Optimizer", "Recommends high-impact knowledge cards to surface to front-line agents."),
                ],
            },
        ],
    },
    {
        "name": "Partner & Channel",
        "description": "Partner ecosystem management, co-sell motions, and channel revenue operations.",
        "swarms": [
            {
                "app": "Salesforce PRM",
                "description": "Partner relationship management and deal operations swarm.",
                "personas": [
                    ("Deal Registration Reviewer", "Validates partner deal registrations for program eligibility."),
                    ("Channel Conflict Detector", "Identifies territory and account conflicts between channels."),
                    ("Partner Tiering Bot", "Evaluates partners against tier criteria and recommends tier changes."),
                ],
            },
            {
                "app": "Impartner",
                "description": "Partner portal engagement and certification management swarm.",
                "personas": [
                    ("Partner Onboarding Orchestrator", "Guides new partners through onboarding and certification steps."),
                    ("Portal Engagement Tracker", "Measures partner portal activity and asset consumption."),
                    ("Certification Monitor", "Tracks partner certification progress and alerts on expiry."),
                ],
            },
            {
                "app": "Crossbeam",
                "description": "Ecosystem intelligence and account overlap co-sell swarm.",
                "personas": [
                    ("Account Overlap Analyzer", "Surfaces shared customer accounts for co-sell opportunities."),
                    ("Ecosystem Pipeline Builder", "Identifies partner-sourced pipeline opportunities by segment."),
                    ("Attribution Mapper", "Tracks partner influence and sourcing across the revenue pipeline."),
                ],
            },
            {
                "app": "Alliances Hub",
                "description": "Strategic alliance health and co-marketing program swarm.",
                "personas": [
                    ("Partner Health Monitor", "Tracks alliance KPIs and joint pipeline health metrics."),
                    ("Co-sell Pipeline Tracker", "Monitors co-sell deal progression and joint win rates."),
                    ("MDF Compliance Agent", "Validates market development fund usage against program guidelines."),
                ],
            },
        ],
    },
]

# ---------------------------------------------------------------------------
# Seed runner
# ---------------------------------------------------------------------------

async def seed() -> None:
    async with AsyncSessionLocal() as db:
        total_departments = 0
        total_swarms = 0
        total_agents = 0

        for dept_data in DEPARTMENTS:
            bu = BusinessUnit(
                name=dept_data["name"],
                description=dept_data["description"],
            )
            db.add(bu)
            await db.flush()
            total_departments += 1
            print(f"  Dept: {bu.name}")

            for swarm_data in dept_data["swarms"]:
                group = AgentGroup(
                    business_unit_id=bu.id,
                    name=swarm_data["app"],
                    description=swarm_data["description"],
                )
                db.add(group)
                await db.flush()
                total_swarms += 1
                print(f"    Swarm: {group.name}")

                for persona_name, persona_desc in swarm_data["personas"]:
                    agent = Agent(
                        business_unit_id=bu.id,
                        group_id=group.id,
                        name=persona_name,
                        description=persona_desc,
                        status="published",
                    )
                    db.add(agent)
                    await db.flush()

                    version = AgentVersion(
                        agent_id=agent.id,
                        version_number=1,
                        prompt=persona_desc,
                        graph_definition=None,
                        tools=[],
                    )
                    db.add(version)
                    total_agents += 1
                    print(f"      Agent: {agent.name}")

        await db.commit()
        print(
            f"\nDone. Created {total_departments} departments, "
            f"{total_swarms} swarms, {total_agents} persona agents."
        )


if __name__ == "__main__":
    asyncio.run(seed())
