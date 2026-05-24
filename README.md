# 🔍 Instance Inspector

**Instance Inspector** is a live AWS Auto Scaling and Application Load Balancer visualizer. It lets you pour traffic onto two independent server fleets, watch CPU and capacity change in real time, and observe EC2 instances launch or terminate as Auto Scaling responds to demand.

The project can run in two modes:

- **AWS live mode** — deploys a complete AWS CDK stack with an internet-facing ALB, two EC2 Auto Scaling Groups, CloudWatch dashboards, EventBridge lifecycle rules, and SNS email alerts.
- **Local zero-AWS mode** — runs a built-in in-memory simulator that mirrors scale-out, scale-in, instance warmup, and connection draining without needing an AWS account.

---

## Solution Architecture

The AWS version deploys an internet-facing Application Load Balancer in front of two independently scalable EC2 fleets:

- `/*` routes to the **Frontend Auto Scaling Group**.
- `/api/*` routes to the **Backend Auto Scaling Group** with higher listener-rule priority.
- Both fleets scale on `ALB RequestCountPerTarget`.
- EC2 instances pull frontend and backend artifacts from S3 during boot.
- CloudWatch collects logs and metrics for the dashboard.
- EventBridge captures Auto Scaling lifecycle events and publishes plain-English alerts through SNS.

<img width="1672" height="941" alt="AWS-Instance-Inspector-Architecture" src="https://github.com/user-attachments/assets/b5f012e3-7971-4c7d-88e0-d4a1582b65fd" />

---

## Table of Contents

- [What It Does](#what-it-does)
- [Solution Architecture](#solution-architecture)
- [AWS Components](#aws-components)
- [Runtime Flows](#runtime-flows)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Development](#local-development)
- [AWS Deployment](#aws-deployment)
- [How Auto Scaling Works](#how-auto-scaling-works)
- [CloudWatch Dashboard](#cloudwatch-dashboard)
- [Email Alerts](#email-alerts)
- [Teardown](#teardown)
- [Cost Notes](#cost-notes)

---

## What It Does

| Feature                    | Description                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Live fleet view**        | Real-time grid of EC2 instances, including availability zone, CPU percentage, and lifecycle state.      |
| **Traffic flood controls** | Buttons generate sustained request bursts to the frontend or backend tier to trigger scaling behavior.  |
| **Plain-English narrator** | Explains scale-out, scale-in, CPU, and lifecycle events as they happen.                                 |
| **Metrics bar**            | Shows total server count, per-tier average CPU, and total requests sent.                                |
| **Local simulator**        | Runs a complete in-memory Auto Scaling simulation with no AWS account required.                         |
| **CloudWatch dashboard**   | Provides deployed observability for ALB requests, latency, 5xx errors, fleet capacity, CPU, and logs.   |
| **Email alerts**           | Sends human-readable SNS notifications when EC2 instances launch, terminate, or fail lifecycle actions. |


---

## AWS Components

| Component                           | Purpose                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **VPC**                             | Isolated network using two public subnets across two Availability Zones. The design intentionally avoids a NAT gateway to keep demo cost low. |
| **Application Load Balancer**       | Internet-facing entry point on port `80`; routes UI traffic to the frontend fleet and API traffic to the backend fleet.                       |
| **Frontend Auto Scaling Group**     | Runs `2–4` `t3.micro` EC2 instances. Each instance serves the Vite/React SPA through Nginx on port `3000` and exposes a stress endpoint.      |
| **Backend Auto Scaling Group**      | Runs `2–4` `t3.micro` EC2 instances. Each instance runs the Express API on port `4000` and reads ASG and CloudWatch data through AWS SDK v3.  |
| **Amazon S3**                       | Stores the built frontend bundle and backend source package. EC2 user data syncs artifacts from S3 during boot.                               |
| **IAM Instance Role**               | Shared EC2 role with SSM access, CloudWatch agent write permissions, and read-only EC2/Auto Scaling describe permissions.                     |
| **Amazon CloudWatch**               | Stores frontend and backend logs, exposes fleet and ALB metrics, and powers the deployed dashboard.                                           |
| **Amazon EventBridge + Amazon SNS** | Watches Auto Scaling lifecycle events and sends plain-English email alerts to the configured administrator.                                   |

---

## Runtime Flows

### 1. Request Path

```text
Browser
  → Internet Gateway
  → Application Load Balancer
  → Frontend EC2 on port 3000
  → Backend EC2 on port 4000 for /api/* traffic
```

### 2. EC2 Boot Sequence

```text
EC2 instance launches
  → IAM instance role is assumed
  → aws s3 sync pulls the correct artifact bundle
  → Nginx or Node.js starts
  → ALB health check passes
  → Instance enters service
```

### 3. Scaling Loop

```text
ALB emits RequestCountPerTarget
  → CloudWatch alarm evaluates the metric
  → Auto Scaling Group adjusts DesiredCapacity
  → New EC2 instances boot and join the target group
```

### 4. Observability

```text
CloudWatch Agent on EC2
  → /inspector/frontend and /inspector/backend log groups
  → CloudWatch dashboard
  → Visualizer polls /api/cluster every 25 seconds
```

### 5. Alerting

```text
Auto Scaling lifecycle event
  → EventBridge rule
  → SNS topic
  → Plain-English admin email
```

---

## Tech Stack

| Layer              | Technology                                                |
| ------------------ | --------------------------------------------------------- |
| **Frontend**       | React 18, Framer Motion, Vite                             |
| **Backend**        | Node.js, Express, AWS SDK v3                              |
| **Infrastructure** | AWS CDK v2, JavaScript                                    |
| **Compute**        | Amazon EC2 `t3.micro`, Auto Scaling Groups                |
| **Networking**     | VPC, public subnets, Application Load Balancer            |
| **Storage**        | Amazon S3 for frontend build and backend source artifacts |
| **Observability**  | CloudWatch Logs, CloudWatch Metrics, CloudWatch Dashboard |
| **Alerting**       | EventBridge, SNS email notifications                      |

---

## Project Structure

```text
Instance-Inspector/
├── backend/
│   ├── server.js          # Express API: /api/info, /api/cluster, /api/stress
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Root polling, flood state, event diffing
│   │   ├── hooks.js                    # useCluster poller + useFlood load generator
│   │   ├── theme.js                    # Colors, CPU heat helpers, shared constants
│   │   └── components/
│   │       ├── Diagram.jsx             # ALB + fleet layout with animated traffic flows
│   │       ├── Fleet.jsx               # Per-tier server grid + ghost cards
│   │       ├── ServerCard.jsx          # Individual EC2 card, CPU gauge, state dot
│   │       ├── MetricsBar.jsx          # Top summary strip
│   │       ├── ControlPanel.jsx        # Flood buttons + intensity slider
│   │       ├── Narrator.jsx            # Plain-English event feed
│   │       └── InfoModal.jsx           # Glossary overlay
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── infra/
    ├── bin/app.js                      # CDK entry point
    ├── lib/
    │   ├── instance-inspector-stack.js # Stack assembly and outputs
    │   └── constructs/
    │       ├── networking.js           # VPC and security groups
    │       ├── iam.js                  # EC2 instance role and policies
    │       ├── storage.js              # S3 buckets and deployments
    │       ├── load-balancer.js        # ALB, target groups, listener routing
    │       ├── compute.js              # User data, launch templates, ASGs, scaling
    │       ├── alerting.js             # SNS topic and EventBridge rules
    │       └── observability.js        # CloudWatch log groups and dashboard
    └── package.json
```

---

## Local Development

The backend includes a full in-memory simulator, so you can explore the UI without creating AWS resources.

### Prerequisites

- Node.js 18+

### 1. Start the backend

```bash
cd backend
npm install
LOCAL_DEV=true node server.js
```

Expected output:

```text
Listening on :4000
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite app at:

```text
http://localhost:3000
```

Vite proxies `/api/*` and `/stress-fe` to the backend automatically, so no CORS configuration is required for local development.

### Simulator Behavior

| Condition                           | Action                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| `> 500` req/min per active instance | Launch a new server, simulating scale-out.              |
| `< 10` req/min per active instance  | Terminate a server, simulating scale-in.                |
| New instance                        | Waits `8s` before entering service, simulating warmup.  |
| Terminating instance                | Waits `5s` before removal, simulating connection drain. |
| Scaling cooldown                    | Waits `10s` between scaling decisions.                  |

---

## AWS Deployment

### Prerequisites

- AWS CLI configured with `aws configure`
- AWS CDK bootstrapped in the target account and Region
- Node.js 18+

Bootstrap CDK if needed:

```bash
npx cdk bootstrap
```

### 1. Build the frontend

```bash
cd frontend
npm install
npm run build
```

The build outputs to `frontend/dist/`. CDK uploads this bundle to S3 during deployment.

### 2. Deploy the infrastructure

```bash
cd infra
npm install
npx cdk deploy -c adminEmail=you@example.com
```

`adminEmail` is required. AWS sends a subscription confirmation email for SNS; click the confirmation link before expecting alerts.

### Stack Outputs

| Output          | Description                                                        |
| --------------- | ------------------------------------------------------------------ |
| `AlbDnsName`    | Browser entry point for the live AWS app.                          |
| `ApiUrl`        | Direct link to `/api/info` on whichever backend instance responds. |
| `DashboardUrl`  | Deep link to the CloudWatch observability dashboard.               |
| `AlertTopicArn` | SNS topic ARN for adding or managing alert subscribers.            |

---

## How Auto Scaling Works

When you click **Flood Frontend** or **Flood Backend**, the browser sends repeated request bursts to the selected tier.

```text
User starts a flood
  → Browser sends concurrent requests every 2.5 seconds
  → ALB tracks RequestCountPerTarget for the selected target group
  → Requests per target exceed 500 for roughly one minute
  → Auto Scaling Group launches a new t3.micro instance
  → EC2 pulls artifacts from S3 and starts Nginx or Node.js
  → ALB health check passes
  → Instance enters service
  → EventBridge publishes the lifecycle event to SNS
  → UI shows the new server card with live CPU state
```

When the traffic flood stops, the metric drops. After cooldown and policy evaluation, the Auto Scaling Group drains and terminates extra instances to reduce capacity.

---

## CloudWatch Dashboard

The stack deploys an **InstanceInspector** dashboard with operational visibility for both tiers.

| Widget                      | What it shows                                                          |
| --------------------------- | ---------------------------------------------------------------------- |
| **Requests / Target**       | `RequestCountPerTarget` per tier, which is the direct scaling trigger. |
| **ALB Latency p50**         | Target response time in seconds.                                       |
| **Errors 5xx**              | ALB-level and target-level 5xx counts.                                 |
| **Frontend Fleet Capacity** | Desired, In Service, and Pending frontend instances.                   |
| **Backend Fleet Capacity**  | Desired, In Service, and Pending backend instances.                    |
| **CPU Utilization**         | Average CPU utilization per fleet.                                     |
| **Backend Logs**            | Latest Express log lines.                                              |
| **Frontend Logs**           | Latest Nginx access log lines.                                         |

---

## Email Alerts

Three EventBridge rules watch lifecycle activity across both Auto Scaling Groups and publish human-readable notifications through SNS.

| Trigger                              | Message Intent                                            |
| ------------------------------------ | --------------------------------------------------------- |
| **Instance launched successfully**   | Confirms a new server came online.                        |
| **Instance terminated successfully** | Explains that a server was safely shut down to save cost. |
| **Launch or termination failed**     | Prompts the operator to check the AWS console.            |

Each email includes the fleet name, the AWS-provided reason, and the event timestamp.

---

## Teardown

Destroy the deployed stack when you are done testing:

```bash
cd infra
npx cdk destroy
```

The stack is designed to tear down cleanly, including S3 buckets and CloudWatch log groups.

---

## Cost Notes

The live AWS deployment creates billable resources, including an Application Load Balancer and multiple EC2 `t3.micro` instances. Destroy the stack when you are finished testing.

For a no-cost walkthrough of the visualizer behavior, run the local simulator instead.
