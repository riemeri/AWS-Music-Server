#!/bin/bash

curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.32.0/install.sh | bash
. ~/.nvm/nvm.sh
nvm install 10.15.1

aws configure

cp -f config ~/.aws/config

npm install
npm start