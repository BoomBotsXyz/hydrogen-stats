# Hydrogen Stats

An API for statistics on the Hydrogen exchange.

### development and deployment

Install the AWS SAM CLI  
https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html

To update an existing function, find the handler function in `api/`.

To create a new function or update the infrastructure, add it as infrastructure as code in `template.yaml`

To deploy to AWS:
``` bash
sam build --use-container
sam deploy
```

### endpoint

``` bash
curl https://stats.hydrogendefi.xyz/pools/metadata/?chainID=80001&poolID=1001
```

``` js
axios.get("https://stats.hydrogendefi.xyz/pools/metadata/?chainID=80001&poolID=1001")
```
