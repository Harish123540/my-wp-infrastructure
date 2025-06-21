import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  projectName: process.env.PROJECT_NAME!,
  aws: {
    region: process.env.AWS_REGION!,
    accountId: process.env.AWS_ACCOUNT_ID!,
  },
  github: {
    owner: process.env.GITHUB_OWNER!,
    infraRepo: process.env.GITHUB_INFRA_REPO!,
    appRepo: process.env.GITHUB_APP_REPO!,
    infraBranch: process.env.GITHUB_INFRA_BRANCH!,
    appBranch: process.env.GITHUB_APP_BRANCH!,
  },
  docker: {
    imageTag: process.env.DOCKER_IMAGE_TAG!,
  },
  ecs: {
    containerPort: Number(process.env.ECS_CONTAINER_PORT),
  },
  rds: {
    dbName: 'wordpressdb',
    dbUser: 'admin',
  },
};

export default config;
