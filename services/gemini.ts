import { GoogleGenAI, Type } from "@google/genai";
import { DriveFile } from '../types';

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  return new GoogleGenAI({ apiKey });
};

export const analyzeFileContent = async (file: DriveFile): Promise<{ summary: string; tags: string[] }> => {
  const ai = getClient();
  
  // Clean base64 string (remove data URL prefix if present)
  const base64Data = file.data.split(',')[1] || file.data;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: file.mimeType,
              data: base64Data
            }
          },
          {
            text: "Analyze this file. Provide a concise summary (max 2 sentences) and a list of 3-5 relevant tags to help categorize it. Focus on the visual content for images/videos, audio content for music/audio, or text content for documents."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            tags: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["summary", "tags"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return {
      summary: "Could not generate summary at this time.",
      tags: ["untagged"]
    };
  }
};