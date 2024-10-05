#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
RESET='\033[0m'

echo -e $GREEN "이 스크립트는 life-bookshelf-publish-manager 루트 디렉토리에서 실행되어야 합니다!!" $RESET

echo -e $GREEN "sam build 실행" $RESET
sam build --template template-local.yaml

aws --profile lifebookshelf ecr-public get-login-password --region us-east-1 | docker login --username AWS --password-stdin public.ecr.aws

if [ "$1" == "newPublication" ]; then
    echo -e $GREEN "새로운 출간물을 등록합니다." $RESET
    sam local invoke NewPublicationProcessorFunction --event events/event.json \
        --template .aws-sam/build/template.yaml
elif [ "$1" == "updatePublication" ]; then
    echo -e $GREEN "출간물 수정을 처리합니다." $RESET
    sam local invoke UpdatePublicationProcessorFunction --event events/event.json \
        --template .aws-sam/build/template.yaml
else
    echo -e $RED "잘못된 명령어입니다." $RESET
fi
