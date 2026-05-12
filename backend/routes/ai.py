# backend/routes/ai.py
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv("../.env.local")

router = APIRouter()

try:
    client = genai.Client()
except Exception as e:
    print(f"Warning: Failed to initialize Gemini Client. Check your API key. {e}")
    client = None

class Message(BaseModel):
    role: str
    content: str

class AIRequest(BaseModel):
    messages: List[Message]
    circuitContext: Dict[str, Any]

@router.post("/ai")
async def chat_with_tutor(request: AIRequest):
    if not client:
        raise HTTPException(status_code=500, detail="AI Client not initialized. Check GEMINI_API_KEY.")

    components = request.circuitContext.get("components", {})
    wires = request.circuitContext.get("wires", {})
    
    system_instruction = f"""
    You are an expert Electrical Engineering AI Tutor inside a circuit simulator called CircuitMind.
    The user is currently building a circuit. 
    
    Here is the exact live state of their canvas right now:
    - Components: {list(components.values())}
    - Wires: {list(wires.values())}
    
    Your goal is to help them debug, understand concepts, or suggest improvements. 
    Do not write code for them unless asked. Be concise, direct, and refer specifically to the labels (e.g., 'R1', 'V1') that exist on their canvas.
    """

    formatted_history = []
    for msg in request.messages[:-1]:
        role = "user" if msg.role == "user" else "model"
        formatted_history.append(
            types.Content(role=role, parts=[types.Part.from_text(text=msg.content)])
        )

    last_user_message = request.messages[-1].content

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=last_user_message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            ),
        )
        
        return {"reply": response.text}
        
    except Exception as e:
        print(f"Gemini API Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))