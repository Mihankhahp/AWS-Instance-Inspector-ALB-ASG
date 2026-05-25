import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

class StorageConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    const { frontendInstanceRole, backendInstanceRole } = props;

    // Holds the Vite production build; EC2s pull from here on boot.
    // Run `npm run build` in frontend/ before each `cdk deploy`.
    this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.frontendDeployment = new s3deploy.BucketDeployment(
      this,
      'DeployFrontend',
      {
        sources: [s3deploy.Source.asset('../frontend/dist')],
        destinationBucket: this.frontendBucket,
      },
    );

    this.frontendBucket.grantRead(frontendInstanceRole);

    this.backendBucket = new s3.Bucket(this, 'BackendBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.backendDeployment = new s3deploy.BucketDeployment(
      this,
      'DeployBackend',
      {
        sources: [
          s3deploy.Source.asset('../backend', { exclude: ['node_modules'] }),
        ],
        destinationBucket: this.backendBucket,
      },
    );

    this.backendBucket.grantRead(backendInstanceRole);
  }
}

export { StorageConstruct };
