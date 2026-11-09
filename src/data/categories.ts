export interface Category {
  id: string;
  name: string;
  description: string;
  tag: string;
  tags: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'eks',
    name: 'EKS',
    description: 'Kubernetes cluster runbooks, Karpenter autoscaling, GitOps & security.',
    tag: 'eks',
    tags: ['eks', 'kubernetes', 'karpenter', 'argocd', 'kyverno', 'sealed-secrets'],
  },
  {
    id: 'ecs',
    name: 'ECS',
    description: 'Fargate task workloads, Service Connect networking & autoscaling.',
    tag: 'ecs',
    tags: ['ecs', 'fargate', 'service-connect', 'service-discovery'],
  },
  {
    id: 'networking',
    name: 'Networking',
    description: 'VPC Lattice, Transit Gateways, Network Firewalls & hybrid routing.',
    tag: 'vpc',
    tags: ['vpc', 'transit-gateway', 'vpc-lattice', 'networking', 'network-firewall', 'vpn'],
  },
  {
    id: 'bedrock-ai',
    name: 'Bedrock / AI',
    description: 'Bedrock AgentCore workflows, RAG pipelines, Nova & local LLM inference.',
    tag: 'bedrock',
    tags: ['bedrock', 'agentcore', 'generative-ai', 'rag', 'embeddings', 'ai-ml', 'nova', 'llama'],
  },
  {
    id: 'iam-security',
    name: 'IAM / Security',
    description: 'Zero-trust IAM condition policies, KMS keys & Verified Permissions.',
    tag: 'iam',
    tags: ['iam', 'security', 'kms', 'acm', 'cognito', 'verified-permissions'],
  },
  {
    id: 'cicd',
    name: 'CI/CD',
    description: 'CodePipeline, CodeBuild, GitOps rollouts & ECR lifecycle patterns.',
    tag: 'cicd',
    tags: ['cicd', 'codepipeline', 'codebuild', 'codedeploy', 'ecr'],
  },
  {
    id: 'serverless',
    name: 'Serverless',
    description: 'Lambda runtimes, API Gateway authorizers, AppSync GraphQL & EventBridge.',
    tag: 'lambda',
    tags: ['lambda', 'api-gateway', 'appsync', 'eventbridge', 'sam', 'serverless'],
  },
  {
    id: 'data',
    name: 'Data',
    description: 'DynamoDB streams, Aurora/RDS IAM auth, Glue ETL & Kinesis streaming.',
    tag: 'data',
    tags: ['dynamodb', 'rds', 'glue', 'kinesis', 'athena', 'elasticache', 'valkey', 'data'],
  },
];

export function getCategoryForPost(postTags: string[]): Category | undefined {
  const lower = postTags.map((t) => t.toLowerCase());
  for (const cat of CATEGORIES) {
    if (cat.tags.some((t) => lower.includes(t))) {
      return cat;
    }
  }
  return undefined;
}

