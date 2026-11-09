export interface SeriesGuide {
  slug: string;
  order: number;
  stage: string;
  summary: string;
}

export interface Series {
  id: string;
  slug: string;
  title: string;
  shortTitle: string;
  badge: string;
  description: string;
  metaDescription: string;
  guides: SeriesGuide[];
}

export const SERIES_LIST: Series[] = [
  {
    id: 'eks',
    slug: 'eks',
    title: 'Amazon EKS Production Runbook Series',
    shortTitle: 'Amazon EKS',
    badge: 'Kubernetes & EKS',
    description: 'A structured, end-to-end curriculum for running production Kubernetes workloads on Amazon EKS-from cluster bootstrap and workloads to Karpenter scaling, Kyverno governance, storage CSI, and GitOps.',
    metaDescription: 'Complete Amazon EKS runbook series: cluster provisioning, Karpenter autoscaling, AWS Load Balancer Controller, Kyverno policies, and day-2 operations.',
    guides: [
      { slug: 'eks-getting-started', order: 1, stage: 'Fundamentals', summary: 'Provision your first production-ready EKS cluster with eksctl, VPC subnets, and kubectl configuration.' },
      { slug: 'eks-kubernetes-workloads-reference', order: 2, stage: 'Fundamentals', summary: 'Reference guide for Deployments, StatefulSets, DaemonSets, Jobs, probes, and resource requests.' },
      { slug: 'eks-kubernetes-yaml-examples', order: 3, stage: 'Fundamentals', summary: 'Copy-paste YAML manifests for Services, ConfigMaps, Ingress, and basic pod specifications.' },
      { slug: 'eks-fargate-quickstart', order: 4, stage: 'Fundamentals', summary: 'Run serverless pods on AWS Fargate without managing EC2 worker nodes or autoscaling groups.' },
      { slug: 'eks-alb-ingress-controller', order: 5, stage: 'Ingress & Networking', summary: 'Configure the AWS Load Balancer Controller, IAM roles for service accounts (IRSA), and ALB Ingress.' },
      { slug: 'eks-deploy-app-alb-autoscaling', order: 6, stage: 'Ingress & Networking', summary: 'Deploy applications with ALB Ingress, target group health checks, and Horizontal Pod Autoscaling (HPA).' },
      { slug: 'eks-storage-ebs-efs-s3', order: 7, stage: 'Storage & Persistence', summary: 'Architect persistent volumes using AWS EBS CSI, EFS shared filesystems, and Mountpoint for Amazon S3.' },
      { slug: 'eks-prometheus-ebs-storage', order: 8, stage: 'Storage & Persistence', summary: 'Deploy Prometheus metrics collection with persistent EBS volume storage classes.' },
      { slug: 'eks-cluster-autoscaler-and-karpenter', order: 9, stage: 'Autoscaling & Node Management', summary: 'Compare Cluster Autoscaler with Karpenter NodePools for cost-effective just-in-time capacity.' },
      { slug: 'eks-karpenter-install', order: 10, stage: 'Autoscaling & Node Management', summary: 'Install and configure Karpenter with EKS Pod Identity, SQS interruption queues, and EC2NodeClasses.' },
      { slug: 'eks-kyverno-install', order: 11, stage: 'Policy & Security', summary: 'Install the Kyverno admission controller via Helm and configure Pod Security Standards enforcement.' },
      { slug: 'eks-kyverno-console-production-guide', order: 12, stage: 'Policy & Security', summary: 'Production Kyverno governance: non-root users, read-only filesystems, and automated secret generation.' },
      { slug: 'eks-sealed-secret', order: 13, stage: 'Policy & Security', summary: 'Manage encrypted secrets safely in Git using Bitnami Sealed Secrets asymmetric cryptography.' },
      { slug: 'eks-keycloak-production-console-guide', order: 14, stage: 'Identity & Access', summary: 'Deploy enterprise Keycloak on EKS backed by Amazon Aurora PostgreSQL and ALB ingress.' },
      { slug: 'eks-shopsphere-walkthrough', order: 15, stage: 'Workload Migration & Architectures', summary: 'Full e-commerce microservices reference implementation deployed on Amazon EKS.' },
      { slug: 'eks-orderflow-migration-guide', order: 16, stage: 'Workload Migration & Architectures', summary: 'Step-by-step workload migration runbook: containerization, Helm charts, and zero-downtime cutover.' },
      { slug: 'eks-orderflow-cli-snippets', order: 17, stage: 'Operations & Troubleshooting', summary: 'Daily operational CLI cheat sheet for debugging pods, DNS resolution, and routing triage.' },
      { slug: 'eks-cluster-operations-runbook', order: 18, stage: 'Operations & Troubleshooting', summary: 'Cluster upgrade workflows, node group draining, control plane logging, and CoreDNS remediation.' }
    ]
  },
  {
    id: 'ecs',
    slug: 'ecs',
    title: 'Amazon ECS Architecture & Production Networking Series',
    shortTitle: 'Amazon ECS',
    badge: 'Containers & ECS',
    description: 'Master Amazon Elastic Container Service (ECS) on AWS Fargate: compare Service Connect vs Cloud Map, integrate persistent storage (EFS/EBS), automate SQS queue depth autoscaling, and build CI/CD pipelines.',
    metaDescription: 'Amazon ECS production series: Service Connect Envoy mesh, Cloud Map discovery, EFS storage, queue-depth autoscaling, and ShopFlow microservices.',
    guides: [
      { slug: 'aws-ecs-service-connect-vs-discovery', order: 1, stage: 'Networking & Discovery', summary: 'Direct architectural comparison: Service Connect Envoy proxy mesh versus Cloud Map DNS discovery.' },
      { slug: 'ecs-production-service-connect-discovery-storage', order: 2, stage: 'Storage & Architecture', summary: 'Combine Service Connect east-west routing with production storage: EBS, EFS, and S3 Files.' },
      { slug: 'ecs-shopflow-production-walkthrough', order: 3, stage: 'Microservices Deployment', summary: 'Build the four-service ShopFlow application on ECS Fargate with Service Connect, ALB, and EFS.' },
      { slug: 'ecs-autoscaling-sqs-queue-depth', order: 4, stage: 'Scaling & Performance', summary: 'Configure target tracking autoscaling based on Amazon SQS backlog queue depth metrics.' },
      { slug: 'aws-ecs-codepipeline-cicd', order: 5, stage: 'Automation & CI/CD', summary: 'Build automated continuous deployment pipelines for ECS tasks using AWS CodePipeline and ECR.' }
    ]
  },
  {
    id: 'vpc-lattice',
    slug: 'vpc-lattice',
    title: 'AWS VPC Lattice Application Networking Series',
    shortTitle: 'VPC Lattice',
    badge: 'Advanced Networking',
    description: 'Connect and secure microservices across VPCs and heterogeneous compute (ECS, EKS, EC2, Lambda) using AWS VPC Lattice service networks, path routing, and Kubernetes Gateway API controllers.',
    metaDescription: 'AWS VPC Lattice series: service network architecture, path-based routing labs, Amazon EKS Gateway API controller, and cross-account IAM auth.',
    guides: [
      { slug: 'aws-vpc-lattice-application-networking', order: 1, stage: 'Architecture & Foundations', summary: 'Overarching multi-VPC architecture connecting ECS, EKS, EC2, Lambda, and private RDS.' },
      { slug: 'aws-vpc-lattice-path-routing-lab', order: 2, stage: 'Hands-on Labs', summary: 'Configure path-based routing rules across multi-service backends in an isolated lab.' },
      { slug: 'eks-ingress-vpc-lattice-console-guide', order: 3, stage: 'EKS Integration', summary: 'Console walk-through for attaching Amazon EKS workloads to Lattice service networks.' },
      { slug: 'eks-vpc-lattice-gateway-api-updated', order: 4, stage: 'Kubernetes Gateway API', summary: 'Modern declarative EKS Gateway API setup using EKS Pod Identity and HTTPRoute manifests.' },
      { slug: 'eks-vpc-lattice-gateway-api', order: 5, stage: 'Legacy Reference', summary: 'Reference guide for older clusters running the Lattice Gateway API controller with IRSA.' }
    ]
  },
  {
    id: 'ecr',
    slug: 'ecr',
    title: 'Amazon ECR & Container Security Series',
    shortTitle: 'Amazon ECR',
    badge: 'Security & Registries',
    description: 'Enterprise container image management: non-root Docker builds for Alpine, repository cross-account access policies, KMS encryption, scan on push, and complex lifecycle retention rules.',
    metaDescription: 'Amazon ECR series: Alpine non-root Dockerfiles, repository policies, KMS encryption, and advanced lifecycle retention policies.',
    guides: [
      { slug: 'docker-alpine-ecr-patterns', order: 1, stage: 'Container Hardening', summary: 'Build secure, non-root Alpine and Debian container images with custom UID/GID security configurations.' },
      { slug: 'aws-ecr-access-lifecycle-console-guide', order: 2, stage: 'Console Operations', summary: 'Manage cross-account access policies, repository encryption with KMS, and basic lifecycle rules.' },
      { slug: 'aws-ecr-lifecycle-policy', order: 3, stage: 'Policy Mechanics', summary: 'Deep JSON syntax guide: prefix matching traps, untagged image purging, and retention policies.' },
      { slug: 'eks-ecr-best-practices', order: 4, stage: 'EKS Best Practices', summary: 'Production registry baselines for Kubernetes: immutable tags, vulnerability scanning, and IAM.' }
    ]
  },
  {
    id: 'cognito-apigw',
    slug: 'cognito-apigw',
    title: 'AWS Cognito & API Gateway Architecture Series',
    shortTitle: 'Cognito & API Gateway',
    badge: 'Auth & APIs',
    description: 'Secure, authenticate, and manage APIs at scale: Cognito User & Identity Pools, Lambda authorizers, stage canaries, Cedar policy authorization, DynamoDB VTL mappings, and WebSockets.',
    metaDescription: 'AWS Cognito & API Gateway series: JWT authorizers, Keycloak federation, Cedar policies, VTL mapping, stage canaries, and WebSocket APIs.',
    guides: [
      { slug: 'aws-apigateway-cognito-auth', order: 1, stage: 'Authentication & Tokens', summary: 'Secure REST and HTTP APIs using Cognito User Pools (JWT) and Identity Pools (SigV4) with custom OAuth scopes.' },
      { slug: 'aws-apigateway-cognito-lambda-authorizers-canary', order: 2, stage: 'Authorizers & Canaries', summary: 'Configure Lambda authorizers, binary media types, stage canary rollouts, and API response caching.' },
      { slug: 'aws-cognito-keycloak-federation', order: 3, stage: 'Enterprise Federation', summary: 'Federate enterprise Keycloak OpenID Connect (OIDC) with Amazon Cognito User Pools for SSO.' },
      { slug: 'aws-verified-permissions-cognito-apigw', order: 4, stage: 'Fine-Grained Authorization', summary: 'Implement fine-grained Cedar policy authorization for API Gateway routes using Amazon Verified Permissions.' },
      { slug: 'aws-apigateway-dynamodb-mapping', order: 5, stage: 'Service Integrations', summary: 'Direct DynamoDB integration using Velocity Template Language (VTL) mappings without Lambda compute.' },
      { slug: 'aws-apigateway-websocket', order: 6, stage: 'Real-Time APIs', summary: 'Bidirectional real-time WebSocket APIs with route keys, @connections management, and mock responses.' }
    ]
  },
  {
    id: 'agentcore',
    slug: 'agentcore',
    title: 'AWS Bedrock AgentCore & Generative AI Series',
    shortTitle: 'Bedrock AgentCore',
    badge: 'Generative AI',
    description: 'Build and operationalize autonomous AI agents on Amazon Bedrock: Amazon Nova foundation models, multimodal embeddings, AgentCore runtime, DynamoDB Streams fraud pipelines, and guardrails.',
    metaDescription: 'Amazon Bedrock AgentCore series: Amazon Nova models, vector RAG, microVM runtime, multi-agent fraud detection, and production guardrails.',
    guides: [
      { slug: 'building-with-nova', order: 1, stage: 'Foundation Models', summary: 'Prompt engineering and multimodal generation with Amazon Nova Micro, Lite, Pro, and Canvas.' },
      { slug: 'embeddings-and-rag', order: 2, stage: 'Vector Search & RAG', summary: 'Architect enterprise RAG with Nova Multimodal Embeddings and OpenSearch Serverless vector search.' },
      { slug: 'aws-bedrock-agentcore-lambda-ec2', order: 3, stage: 'AgentCore Runtimes', summary: 'Deploy agents on AgentCore Runtime via microVM or EC2 instances, and invoke sessions with Lambda.' },
      { slug: 'bedrock-agentcore-production-guide', order: 4, stage: 'Production Architecture', summary: 'Production agent architecture: session persistence, memory state, action groups, and guardrails.' },
      { slug: 'bedrock-agentcore-fraud-dynamodb-stream', order: 5, stage: 'Autonomous Pipelines', summary: 'Event-driven real-time fraud detection with DynamoDB Streams, Lambda triggers, and multi-agent harnesses.' },
      { slug: 'deploy-operate-and-integrate', order: 6, stage: 'Operations & Safety', summary: 'Operationalize foundation models: Bedrock Guardrails, CloudWatch monitoring, and data privacy.' }
    ]
  },
  {
    id: 'cicd',
    slug: 'cicd',
    title: 'AWS CI/CD Automation & GitOps Series',
    shortTitle: 'CI/CD & GitOps',
    badge: 'DevOps & GitOps',
    description: 'Automate build, test, and release pipelines: AWS CodePipeline, CodeBuild, CodeDeploy canary deployments, Amazon ECS container deployments, and Amazon EKS GitOps with Argo CD.',
    metaDescription: 'AWS CI/CD & GitOps series: CodePipeline automation, Lambda canary deployments, ECS Fargate releases, and Argo CD GitOps pipelines.',
    guides: [
      { slug: 'aws-cicd-codepipeline-codebuild-codedeploy', order: 1, stage: 'Core AWS Pipelines', summary: 'Automated continuous delivery pipeline on AWS using CodePipeline, CodeBuild, and CodeDeploy.' },
      { slug: 'aws-codepipeline-console-full-system-guide', order: 2, stage: 'Console Operations', summary: 'Build multi-stage CI/CD pipelines with GitHub sources, CodeBuild test suites, and manual approvals.' },
      { slug: 'aws-lambda-codepipeline-codedeploy', order: 3, stage: 'Serverless Canary Releases', summary: 'Zero-downtime canary and linear deployments for AWS Lambda using CodeDeploy and CloudWatch alarms.' },
      { slug: 'aws-ecs-codepipeline-cicd', order: 4, stage: 'Container Continuous Delivery', summary: 'Automated CI/CD pipelines for Amazon ECS Fargate and Lambda using imagedefinitions.json.' },
      { slug: 'eks-argocd-install', order: 5, stage: 'Kubernetes GitOps Bootstrap', summary: 'Deploy Argo CD on Amazon EKS: namespace setup, Helm installation, and NLB UI exposure.' },
      { slug: 'eks-argocd-codecommit-pipeline', order: 6, stage: 'End-to-End GitOps Pipelines', summary: 'Complete GitOps delivery pipeline with AWS CodeCommit, Amazon ECR, and automated Argo CD sync.' }
    ]
  }
];

export function getSeriesForPost(slug: string): { series: Series; guide: SeriesGuide; prevGuide?: SeriesGuide; nextGuide?: SeriesGuide } | null {
  for (const s of SERIES_LIST) {
    const idx = s.guides.findIndex((g) => g.slug === slug);
    if (idx !== -1) {
      return {
        series: s,
        guide: s.guides[idx],
        prevGuide: idx > 0 ? s.guides[idx - 1] : undefined,
        nextGuide: idx < s.guides.length - 1 ? s.guides[idx + 1] : undefined
      };
    }
  }
  return null;
}

