import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as fs from 'fs';

export class JobPollerStack extends cdk.Stack {
  constructor(app: cdk.App, id: string) {
    super(app, id);

    const checkLambda = new lambda.Function(this, 'CheckLambda', {
      code: new lambda.InlineCode(fs.readFileSync('lib/lambdas/check_status.py', { encoding: 'utf-8' })),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(30),
      runtime: lambda.Runtime.PYTHON_3_9
    });

    const submitLambda = new lambda.Function(this, 'SubmitLambda', {
      code: new lambda.InlineCode(fs.readFileSync('lib/lambdas/submit.py', { encoding: 'utf-8' })),
      handler: 'index.main',
      timeout: cdk.Duration.seconds(30),
      runtime: lambda.Runtime.PYTHON_3_9
    });

    const submitJob = new tasks.LambdaInvoke(this, 'Submit Job', {
      lambdaFunction: submitLambda,
      outputPath: '$.Payload'
    });
    const waitX = new sfn.Wait(this, 'Wait X Seconds', {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(30))
    });
    const getStatus = new tasks.LambdaInvoke(this, 'Get Job Status', {
      lambdaFunction: checkLambda,
      outputPath: '$.Payload'
    });
    const jobFailed = new sfn.Fail(this, 'Job Failed', {
      cause: 'AWS Batch Job Failed',
      error: 'DescribeJob returned FAILED'
    });
    const finalStatus = new tasks.LambdaInvoke(this, 'Get Final Job Status', {
      lambdaFunction: checkLambda,
      outputPath: '$.Payload'
    });

    const definition = submitJob.next(waitX)
      .next(getStatus)
      .next(new sfn.Choice(this, 'Job Complete ?')
        .when(sfn.Condition.stringEquals('$.status', 'FAILED'), jobFailed)
        .when(sfn.Condition.stringEquals('$.status', 'SUCCEEDED'), finalStatus)
        .otherwise(waitX)
      );

    const stateMachine = new sfn.StateMachine(this, 'CronStateMachine', {
      definition,
      timeout: cdk.Duration.minutes(5)
    });

    submitLambda.grantInvoke(stateMachine.role);
    checkLambda.grantInvoke(stateMachine.role);

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.expression('cron(0 18 ? * MON-FRI *)')
    });
    rule.addTarget(new targets.SfnStateMachine(stateMachine));
  }
}

const app = new cdk.App();
new JobPollerStack(app, 'aws-stepfunctions-integ');
app.synth();
