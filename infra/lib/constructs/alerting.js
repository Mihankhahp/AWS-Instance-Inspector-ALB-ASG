import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

class AlertingConstruct extends Construct {
  constructor(scope, id, props) {
    super(scope, id, props);

    const { adminEmail, frontendAsg, backendAsg } = props;

    // AWS sends a confirmation email first — admin must click the link before
    // notifications start arriving.
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'instance-inspector-alerts',
      displayName: 'Instance Inspector',
    });
    this.alertTopic.addSubscription(
      new snsSubscriptions.EmailSubscription(adminEmail),
    );

    const asgNames = [
      frontendAsg.autoScalingGroupName,
      backendAsg.autoScalingGroupName,
    ];

    const asgField = events.EventField.fromPath(
      '$.detail.AutoScalingGroupName',
    );
    const causeField = events.EventField.fromPath('$.detail.Cause');
    const timeField = events.EventField.fromPath('$.time');

    // Scale-out: a new server launched successfully
    const scaleOutRule = new events.Rule(this, 'ScaleOutRule', {
      description: 'ASG launched a new instance',
      eventPattern: {
        source: ['aws.autoscaling'],
        detailType: ['EC2 Instance Launch Successful'],
        detail: { AutoScalingGroupName: asgNames },
      },
    });
    scaleOutRule.addTarget(
      new eventTargets.SnsTopic(this.alertTopic, {
        message: events.RuleTargetInput.fromText(
          `🎉 Good news — a new server just came online!

Your app was getting busy with visitors, so AWS automatically launched a new server to share the load. Think of it like opening an extra checkout lane at the supermarket when the lines get long. This is called "scaling out."

Fleet:  ${asgField}
Reason: ${causeField}
Time:   ${timeField}

Everything is working normally. No action needed — this is Auto Scaling doing exactly what it's designed to do!

— Instance Inspector 🔍`,
        ),
      }),
    );

    // Scale-in: a server was safely terminated to save money
    const scaleInRule = new events.Rule(this, 'ScaleInRule', {
      description: 'ASG terminated an instance',
      eventPattern: {
        source: ['aws.autoscaling'],
        detailType: ['EC2 Instance Terminate Successful'],
        detail: { AutoScalingGroupName: asgNames },
      },
    });
    scaleInRule.addTarget(
      new eventTargets.SnsTopic(this.alertTopic, {
        message: events.RuleTargetInput.fromText(
          `💰 A server was safely shut down to save money.

Traffic has slowed down, so AWS automatically removed a server that was no longer needed. Think of it like closing checkout lanes when the store gets quiet. This is called "scaling in" and it keeps your cloud bill low.

Fleet:  ${asgField}
Reason: ${causeField}
Time:   ${timeField}

Everything is working normally. No action needed — your app is still running on the remaining servers!

— Instance Inspector 🔍`,
        ),
      }),
    );

    // Errors: a launch or termination attempt failed
    const asgErrorRule = new events.Rule(this, 'AsgErrorRule', {
      description: 'ASG launch or termination failed',
      eventPattern: {
        source: ['aws.autoscaling'],
        detailType: [
          'EC2 Instance Launch Unsuccessful',
          'EC2 Instance Terminate Unsuccessful',
        ],
        detail: { AutoScalingGroupName: asgNames },
      },
    });
    asgErrorRule.addTarget(
      new eventTargets.SnsTopic(this.alertTopic, {
        message: events.RuleTargetInput.fromText(
          `⚠️ Heads up — a server change ran into a problem.

AWS tried to add or remove a server but something went wrong. Your app is still running on the servers that are already healthy, but you may want to take a look at the AWS Console for more details.

Fleet:  ${asgField}
Reason: ${causeField}
Time:   ${timeField}

You can check the Instance Inspector CloudWatch Dashboard for more information, or open the EC2 Auto Scaling section in the AWS Console.

— Instance Inspector 🔍`,
        ),
      }),
    );
  }
}

export { AlertingConstruct };
