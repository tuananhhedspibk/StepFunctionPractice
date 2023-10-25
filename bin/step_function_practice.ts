#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { JobPollerStack } from '../lib/step_function_practice-stack';

const app = new cdk.App();
new JobPollerStack(app, 'JobPollerStack');
