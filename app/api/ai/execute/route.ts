import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Helper function to replace template variables
function replaceTemplateVariables(text: string, input: any): string {
  if (!text || typeof text !== "string") return text;

  // Replace {{input}} with the whole input
  let result = text.replace(
    /\{\{input\}\}/g,
    typeof input === "object" ? JSON.stringify(input) : String(input)
  );

  // Replace {{input.field}} or {{input.nested.field}} with specific fields
  result = result.replace(
    /\{\{input\.([^}]+)\}\}/g,
    (match: string, path: string) => {
      const fields = path.split(".");
      let value = input;

      for (const field of fields) {
        if (value && typeof value === "object" && field in value) {
          value = value[field];
        } else {
          return match; // Keep original if path doesn't exist
        }
      }

      return typeof value === "object" ? JSON.stringify(value) : String(value);
    }
  );

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { type, config, input } = await request.json();


    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured in .env" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const deploymentId = "llama-3.3-70b-versatile";

    let result;

    switch (type) {
      case "aiTextGenerator":
        result = await executeTextGenerator(
          config,
          input,
          openai,
          deploymentId
        );
        break;

      case "aiAnalyzer":
        result = await executeAnalyzer(config, input, openai, deploymentId);
        break;

      case "aiChatbot":
        result = await executeChatbot(config, input, openai, deploymentId);
        break;

      case "aiDataExtractor":
        result = await executeDataExtractor(
          config,
          input,
          openai,
          deploymentId
        );
        break;

      default:
        return NextResponse.json(
          { error: `Unknown AI node type: ${type}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI execution error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      status: error.status,
      response: error.response,
    });
    return NextResponse.json(
      {
        error: error.message || "AI execution failed",
        details: error.status ? `Status: ${error.status}` : undefined,
      },
      { status: 500 }
    );
  }
}

async function executeTextGenerator(
  config: any,
  input: any,
  openai: OpenAI,
  deploymentId: string
) {
  let { prompt, temperature, maxTokens } = config;

  // Replace template variables in prompt
  prompt = replaceTemplateVariables(prompt, input);

  console.log("Executing text generator with:", {
    deploymentId,
    prompt: prompt?.substring(0, 50),
  });

  const completion = await openai.chat.completions.create({
    model: deploymentId,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: parseFloat(temperature || "0.7"),
    max_tokens: parseInt(maxTokens || "500"),
  });

  console.log("Text generator completed:", { model: completion.model });

  return {
    generatedText: completion.choices[0].message.content,
    model: deploymentId,
    usage: completion.usage,
  };
}

async function executeAnalyzer(
  config: any,
  input: any,
  openai: OpenAI,
  deploymentId: string
) {
  let { text, analysisType } = config;

  // Process template variables in text
  text = replaceTemplateVariables(text, input);

  let systemPrompt = "";
  switch (analysisType) {
    case "sentiment":
      systemPrompt =
        "Analyze the sentiment of the following text. Respond with: Positive, Negative, or Neutral, followed by a confidence score (0-1) and brief explanation.";
      break;
    case "keywords":
      systemPrompt =
        "Extract the most important keywords and phrases from the following text. Return them as a JSON array.";
      break;
    case "summary":
      systemPrompt =
        "Provide a concise summary of the following text in 2-3 sentences.";
      break;
  }

  const completion = await openai.chat.completions.create({
    model: deploymentId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.3,
  });

  return {
    analysisType,
    result: completion.choices[0].message.content,
    usage: completion.usage,
  };
}

async function executeChatbot(
  config: any,
  input: any,
  openai: OpenAI,
  deploymentId: string
) {
  let { systemPrompt, userMessage, personality } = config;

  // Process template variables
  systemPrompt = replaceTemplateVariables(systemPrompt, input);
  userMessage = replaceTemplateVariables(userMessage, input);

  const personalityPrompts = {
    professional: "Respond in a professional and formal manner.",
    friendly: "Respond in a warm, friendly, and conversational manner.",
    concise: "Respond with brief, to-the-point answers.",
  };

  const fullSystemPrompt = `${systemPrompt}\n\n${personalityPrompts[personality as keyof typeof personalityPrompts] || ""
    }`;

  const completion = await openai.chat.completions.create({
    model: deploymentId,
    messages: [
      { role: "system", content: fullSystemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
  });

  return {
    response: completion.choices[0].message.content,
    personality,
    usage: completion.usage,
  };
}

async function executeDataExtractor(
  config: any,
  input: any,
  openai: OpenAI,
  deploymentId: string
) {
  let { text, schema } = config;

  // Process template variables
  text = replaceTemplateVariables(text, input);
  schema = replaceTemplateVariables(schema, input);

  const systemPrompt = `Extract information from the text according to this schema: ${schema}. Return ONLY a valid JSON object matching the schema, with no additional text or explanation.`;

  const completion = await openai.chat.completions.create({
    model: deploymentId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.1,
  });

  const extractedData = completion.choices[0].message.content;

  try {
    const parsed = JSON.parse(extractedData || "{}");
    return {
      extractedData: parsed,
      schema,
      usage: completion.usage,
    };
  } catch (e) {
    return {
      extractedData: extractedData,
      schema,
      usage: completion.usage,
      note: "Could not parse as JSON, returning raw text",
    };
  }
}