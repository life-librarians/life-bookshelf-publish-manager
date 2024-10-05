# Life bookshelf Publish Manager

**인생책장 서비스의 출판 관리자 서비스입니다.**

## 로컬 개발 환경 설정

### Prerequisites

- Docker Desktop 설치가 필요합니다.
  https://www.docker.com/products/docker-desktop/

- AWS CLI 설치가 필요합니다.
  https://docs.aws.amazon.com/ko_kr/cli/latest/userguide/cli-chap-install.html

- AWS SAM CLI 설치가 필요합니다.
  https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html

## Build and Deploy

```bash
aws configure --profile lifebookshelf
```

aws configure 명령어를 통해 AWS CLI를 설정합니다. AWS Access Key ID, AWS Secret Access Key, Default region name, Default output format을 입력합니다.

```bash
sam build --template template.yaml
```

⚠️ template.yaml 은 샘플 파일이며, 실제 사용할 템플릿 파일을 지정해야 합니다.

sam build 명령어를 통해 AWS Lambda Function 들을 빌드합니다.

```bash
sam package --template-file .aws-sam/build/template.yaml --output-template-file packaged.yml --s3-bucket bucket-name --profile lifebookshelf
```

sam package 명령어를 통해 빌드된 AWS Lambda Function 들을 S3에 업로드합니다.

```bash
sam deploy --template-file packaged.yml --stack-name stack-name --capabilities CAPABILITY_IAM --profile lifebookshelf
```

sam deploy 명령어를 통해 S3에 업로드된 AWS Lambda Function 들을 CloudFormation을 통해 배포합니다.

## Local development

```bash
sam local invoke NewPublicationProcessorFunction --event events/event.json --template .aws-sam/build/template-local.yaml
```

sam local invoke 명령어를 통해 로컬에서 컨테이너 환경 위에 AWS Lambda Function을 실행할 수 있습니다.
sam local invoke의 인자로 실행할 AWS Lambda Function의 이름과 이벤트 파일을 전달합니다.

```bash
aws --lifebookshelf jungko ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws
```

ECR에 로그인되어 있지 않다면 위 명령어를 통해 public ECR에 로그인이 필요합니다.

`--skip-pull-image` 인자를 통해 이미지 pull을 생략할 수 있습니다.

## Cleanup

```bash
aws cloudformation delete-stack --stack-name "stack-name" --profile lifebookshelf
```

다음 명령어를 통해 배포된 CloudFormation Stack을 삭제할 수 있습니다.
