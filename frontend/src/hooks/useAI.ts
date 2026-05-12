import { useState, useCallback } from "react";
import { useCircuitStore } from "../store/circuitStore";

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export function useAI() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const circuit = useCircuitStore(state => state.circuit);
    
    const sendMessage = useCallback(async (content: string) => {
        const newMsg: Message = {role: "user", content};
        setMessages(prev => [...prev, newMsg]);
        setIsLoading(true);
        try {
            const API_BASE_URL = import.meta.env.VITE_API_URL || "";
            
            const response = await fetch(`${API_BASE_URL}/api/ai`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    messages: [...messages, newMsg],
                    circuitContext: circuit
                })
            });
            
            if (!response.ok) throw new Error("Backend connection failed!");
            const data = await response.json();
            setMessages(prev => [...prev, {role: "assistant", content: data.reply}]);
        } catch (error) {
            console.error("AI request error:", error);
            setMessages(prev => [...prev, {role:"assistant", content: "Error connecting to AI backend."}]);
        } finally {
            setIsLoading(false);
        }
    }, [messages, circuit]);
    
    const clearChat = () => setMessages([]);
    return {messages, isLoading, sendMessage, clearChat};
}