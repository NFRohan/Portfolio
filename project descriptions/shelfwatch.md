# 🏪 ShelfWatch

<div align="center">

![Python](https://img.shields.io/badge/Python-3.10-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![ONNX](https://img.shields.io/badge/ONNX-Runtime-blueviolet?logo=onnx&logoColor=white)
![Kubernetes](https://img.shields.io/badge/AWS-EKS-FF9900?logo=kubernetes&logoColor=white)
![Helm](https://img.shields.io/badge/Helm-3.14-0F1689?logo=helm&logoColor=white)
![ArgoCD](https://img.shields.io/badge/ArgoCD-GitOps-EF7B4D?logo=argo&logoColor=white)
![Argo Rollouts](https://img.shields.io/badge/Argo_Rollouts-Canary-blue?logo=argo&logoColor=white)
![NGINX](https://img.shields.io/badge/NGINX-Ingress-009639?logo=nginx&logoColor=white)
![Trivy](https://img.shields.io/badge/Trivy-Security-1904DA?logo=aqua&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

**Retail inventory analysis system.**
*Object detection and stock monitoring at scale.*

[**Demo UI**](http://a308b65d0819a46ebaea83d2dcf9e3af-1215252771.us-east-1.elb.amazonaws.com) • [**Architecture Docs**](docs/architecture.md)

</div>

---

## 🚀 Overview

**ShelfWatch** is an automated stock auditing platform that utilizes a fine-tuned **YOLO11L** model for product detection. The system is deployed as a scalable inference service on AWS EKS, optimized for low-latency CPU execution.

![Interface Overview](./images/UI.png)

### Key Technical Characteristics
*   **Progressive Delivery**: Canary deployments via Argo Rollouts with automated smoke tests before promotion.
*   **Latency-Optimized Inference**: INT8 quantization provides sub-500ms response times on CPU.
*   **DevSecOps Pipeline**: Container scanning (Trivy) and dependency auditing (pip-audit) integrated into CI.
*   **GitOps-Driven**: ArgoCD + Image Updater for fully automated, drift-free deployments.
*   **Dynamic Scaling**: NGINX Ingress with weighted traffic splitting and HPA-driven autoscaling.
*   **Spot Resilience**: Built-in 2-minute interruption handling with Pod Disruption Budgets (PDB) and multi-node redundancy for zero-downtime operation on AWS Spot instances.

## 🏗️ System Architecture

The architecture follows a microserviced approach within an **AWS EKS** cluster. External traffic is routed through an **NGINX Ingress Controller** that supports weighted canary traffic splitting for progressive delivery.

```mermaid
flowchart TB
    Client(["Store Manager / Client API"])

    subgraph CICD["CI/CD Pipeline"]
        GH["GitHub Repository"] -->|Push to main| Actions["GitHub Actions"]
        Actions -->|"Lint, Test, Scan"| SecurityGate{"Trivy + pip-audit"}
        SecurityGate -->|Pass| Build["Docker Build + Push"]
    end

    subgraph AWS["AWS Cloud"]
        direction TB
        ECR[("Amazon ECR")]

        subgraph EKS["Amazon EKS Cluster"]
            direction TB
            NGINX["NGINX Ingress Controller"]
            HPA[["HPA: 70% CPU, Min 2, Max 3"]]

            subgraph Rollout["Argo Rollout - Canary"]
                Stable["Stable Pods 80-100%"]
                Canary["Canary Pod 0-20%"]
            end

            subgraph SmokeTest["AnalysisRun"]
                Job["Inference Smoke Test"]
            end

            subgraph Observability["Observability"]
                Prometheus[("Prometheus")]
                Grafana["Grafana"]
            end

            NGINX -->|"Weighted Split"| Stable
            NGINX -.->|"Canary Traffic"| Canary
            Job -.->|"Validates"| Canary
            HPA -.->|"Scales"| Rollout
            Prometheus -.->|"Scrapes"| Stable
            Grafana -.->|"Queries"| Prometheus
        end

        subgraph GitOps["GitOps Control Plane"]
            ArgoCD["ArgoCD"]
            ImgUpdater["Image Updater"]
        end

        Build -->|Push Image| ECR
        ImgUpdater -.->|"Polls ECR"| ECR
        ImgUpdater ==>|"Updates Tag"| ArgoCD
        ArgoCD -.->|"Watches Git"| GH
        ArgoCD ==>|"Syncs"| EKS
    end

    Client ==>|"GET /"| NGINX
    Client -.->|"GET /grafana"| NGINX
```

### Components
- **Inference Service**: FastAPI application serving detection requests.
- **Model Engine**: In-process ONNX Runtime (CPU) executing quantized weights.
- **Monitoring Stack**: Prometheus for metric collection and Grafana for visualization.
- **Log Aggregation**: Loki + Promtail for centralized logging.

![Loki Logging](./images/logging.png)

## 📡 API Reference

The primary interface for system interaction is the REST API.

### 1. Object Detection
`POST /predict`
- **Description**: Analyzes a shelf image and returns detected product instances.
- **Input**: `multipart/form-data` containing an image file.
- **Response**: JSON with bounding boxes, class labels, and confidence scores.

### 2. Monitoring & Health
| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/health` | GET | Readiness and liveness probe status. |
| `/metrics` | GET | Prometheus-formatted application metrics. |

## 📊 Performance Monitoring

Real-time telemetry includes tail latency tracking (p95/p99) and resource consumption:

![Dashboard Metrics](./images/analytics.png)

## 🛠️ Tech Stack

- **Model**: YOLO11L (Ultralytics)
- **Runtime**: ONNX Runtime (INT8 Quantized)
- **Backend**: FastAPI 0.115+ (Python)
- **Frontend**: Vanilla JavaScript / HTML5 / Canvas
- **Cloud**: AWS EKS, ECR
- **Networking**: NGINX Ingress Controller (L7 traffic routing)
- **DevOps**: Helm, ArgoCD, Argo Rollouts, ArgoCD Image Updater, GitHub Actions
- **Security**: Trivy (container scanning), pip-audit (dependency scanning)
- **Observability**: Prometheus, Loki, Promtail, Grafana

## ⚡ Setup & Deployment

### Local Environment (Docker)
Run the complete stack using Docker Compose:
```bash
docker compose up --build
```
The **Live Interactive UI** is served at [http://a308b65d0819a46ebaea83d2dcf9e3af-1215252771.us-east-1.elb.amazonaws.com](http://a308b65d0819a46ebaea83d2dcf9e3af-1215252771.us-east-1.elb.amazonaws.com).
    
### ⚠️ Known Limitations & Troubleshooting

-   **Image Upload Size**: The inference endpoint is configured with a **20MB** body size limit via NGINX Ingress rules. Uploads exceeding this size will return a `413 Request Entity Too Large` error.
-   **Cold Starts**: The first request to a new pod may experience slightly higher latency as the ONNX model initializes in memory. Subsequent requests typically complete in <500ms.
-   **Browser Cache**: If you see old versions of the UI, try a hard refresh (Ctrl+F5) as static assets are served by NGINX.

### AWS Deployment & CI/CD

The project uses a **fully automated, secure CI/CD pipeline**. Any push to `main` triggers:
1.  **Quality Gate**: Linting (`ruff`), testing (`pytest`), and dependency audit (`pip-audit`).
2.  **Container Build**: Docker image with GHA layer caching.
3.  **Security Scan**: Trivy scans for High/Critical CVEs before push.
4.  **ECR Push**: Verified image uploaded to Amazon ECR.
5.  **Auto-Deploy**: ArgoCD Image Updater detects the new tag and triggers a **Canary Rollout** through Argo Rollouts.

### 📉 Cost Optimization & Deployment Strategy

To maintain a production-grade infrastructure on a budget, this project implements several cloud-native cost-saving measures:

-   **AWS Spot Instances**: The cluster utilizes [Spot instances](https://aws.amazon.com/ec2/spot/) for its managed nodegroups, providing **70-90% savings** compared to on-demand pricing.
-   **Instance Diversification**: The node group is diversified across `m7i-flex.large`, `c7i-flex.large`, and `t3.small` types to ensure high Spot fulfillment and resilience.
-   **Resource "Bin-Packing"**: CPU requests are right-sized to `200m` based on real-world telemetry (~6% CPU usage), allowing for dense pod packing on smaller nodes.
-   **Blue/Green Node Migration**: The infrastructure is designed for "hot" migration. New node groups can be provisioned and old ones drained without any impact on the production LoadBalancer URLs.

### ☁️ GitOps & Progressive Delivery

The project implements a mature **GitOps** model with **progressive delivery**:

1.  **Helm Packaging**: The entire application (Rollout, Service, Ingress, HPA, ConfigMap) is defined as a reusable [Helm Chart](./charts/shelfwatch).
2.  **ArgoCD + Image Updater**: An in-cluster ArgoCD controller monitors GitHub. The Image Updater polls ECR for new tags — **no CI-to-Git commits needed**.
3.  **NGINX Ingress**: Layer 7 traffic routing with weighted canary splitting (even with 1 node).
4.  **Canary Deployments**: Argo Rollouts progressively shifts traffic (20% → 50% → 100%) with an automated **inference smoke test** between steps. Failed tests trigger automatic rollback.

![ArgoCD Dashboard](./images/ArgoCD.png)

To provision the infrastructure for the first time or perform a manual deployment, use:

```powershell
.\infra\aws\deploy.ps1
```

## 📂 Project Structure

```
ShelfWatch/
├── charts/             # Helm chart (Rollout, Ingress, Services, HPA)
├── docs/               # Technical specifications and diagrams
├── images/             # Documentation assets
├── inference/          # API layer and model runner
├── infra/              # Kubernetes, AWS, and ArgoCD manifests
├── scripts/            # Management and export utilities
├── tests/              # Functional and unit verification
└── ui/                 # Static frontend code
```

## 📜 License
MIT License.