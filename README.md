# Hydrogen Stats

An API for statistics on the Hydrogen exchange.

### Development and Deployment

Install the AWS SAM CLI  
https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html

To update an existing function, find the handler function in `api/`.

To create a new function or update the infrastructure, add it as infrastructure as code in `template.yaml`

To deploy to AWS:
``` bash
sam build --use-container
sam deploy
```

### Endpoints

- GET HydrogenNucleus State https://stats.hydrogendefi.xyz/state/?chainID=8453
- GET Route https://stats.hydrogendefi.xyz/route/?chainID=8453&tokenInAddress=0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA&tokenOutAddress=0x4200000000000000000000000000000000000006&amount=1000000&swapType=exactIn

### Usage

``` bash
curl https://stats.hydrogendefi.xyz/state/?chainID=8453
```

``` js
axios.get("https://stats.hydrogendefi.xyz/state/?chainID=8453")
```
