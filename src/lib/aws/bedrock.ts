import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

export function getBedrockClient() {
  return new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });
}

export async function bedrockConverse(prompt: string, system?: string) {
  const client = getBedrockClient();
  const modelId = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-5-sonnet-20241022-v2:0";

  const cmd = new ConverseCommand({
    modelId,
    system: system ? [{ text: system }] : undefined,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 2048, temperature: 0.2 },
  });

  const res = await client.send(cmd);
  const text = res.output?.message?.content?.[0]?.text || "";
  return text;
}
