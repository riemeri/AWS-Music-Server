#!/bin/bash
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash
. /home/ec2-user/.nvm/nvm.sh
nvm install 10.15.1