/* eslint-disable max-len */
import { VertexAI } from '@google-cloud/vertexai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import { PrismaService } from 'nestjs-prisma';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

import { GCP } from '../common/configs/config.interface';
import { Context } from '../common/interfaces/context.interface';

@Injectable()
export class AiService {
  constructor(
    @InjectBot()
    private readonly bot: Telegraf<Context>,
    private prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // void this.testGemini();
  }

  async testGemini() {
    const gcpCredentialStr = this.configService.get<GCP>('gcp')?.credential;

    if (!gcpCredentialStr) {
      return;
    }

    // const gcpCredential = JSON.parse(gcpCredentialStr);

    // const auth = new GoogleAuth({
    //   credentials: {
    //     client_email: gcpCredential.client_email,
    //     private_key: gcpCredential.private_key,
    //   },
    //   projectId: gcpCredential.project_id,
    // });

    // console.log({
    //   googleAuthOptions: {
    //     credentials: gcpCredential,
    //     projectId: gcpCredential.project_id,
    //   },
    // });
    // Initialize Vertex with your Cloud project and location

    console.log('GOOGLE_APPLICATION_CREDENTIALS', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const vertexAi = new VertexAI({
      project: 'prismatic-smoke-413213',
      location: 'us-central1',
      // googleAuthOptions: {
      //   credentials: gcpCredential,
      //   projectId: gcpCredential.project_id,
      // },
    });
    const model = 'gemini-pro-vision';

    // Instantiate the models
    const generativeModel = vertexAi.preview.getGenerativeModel({
      model,
      generation_config: {
        max_output_tokens: 2048,
        temperature: 0.4,
        top_p: 1,
        top_k: 32,
      },
      safety_settings: [],
    });

    async function generateContent() {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'What is capital of France?' }] }],
      };

      const streamingResp = await generativeModel.generateContentStream(req);

      for await (const item of streamingResp.stream) {
        console.log('stream chunk: ===>');
        console.dir(item, { depth: null });
      }

      console.log('aggregated response:');
      console.dir(await streamingResp.response, { depth: null });
    }

    await generateContent();
  }
}
