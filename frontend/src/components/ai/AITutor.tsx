import React, {useState, useRef, useEffect} from "react";
import {useAI} from "../../hooks/useAI";

interface AITutorProps {
    onClose: () => void;
}
const AITutor: React.FC<AITutorProps> = ({onClose}) => {
    const {messages, isLoading, sendMessage, clearChat} = useAI();
    const [input, setInput] = useState("");
    const endOfMessagesRef = useRef<HTMLDivElement>(null);
    
    const handleSend = () => {
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput("");
    };
    
    useEffect(() => {
        endOfMessagesRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages, isLoading]);
    
    return (
        <div style={{
            position: "absolute", top: 16, right: 16, width: 320, height: 500,
            background: "#080f1a", border: "1px solid #1e2a3a", borderRadius: 8,
            display: "flex", flexDirection: "column", boxShadow:"0 10px 30px #000000aa", zIndex:50
        }}>
            <div style={{
                display:"flex", justifyContent:"space-between", alignItems: "center", padding: "10px 12px",
                borderBottom: "1px solid #1e2a3a", background: "#0f1f2e", borderTopLeftRadius: 8, borderTopRightRadius: 8
            }}>
                <span style={{ color: "#38bdf8", fontSize: 13, fontWeight: 700, fontFamily: "monospace"}}>
                    🧠 AI Tutor
                </span>
                <div style={{display: "flex", gap: 8}}>
                    <button onClick={clearChat} style={btnStyle}>Clear</button>
                    <button onClick={onClose} style={btnStyle}>✕</button>
                </div>
            </div>
            
            <div style={{flex: 1, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap:10}}>
                {messages.length === 0 && (
                    <div style={{color: "#4a5568", fontSize: 12, textAlign: "center", marginTop: 20}}>
                        Ask me about your circuit parameters, stability, or components!
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} style={{
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                        background: msg.role === "user" ? "#38bdf822" : "#1e2a3a",
                        color: msg.role === "user" ? "#7dd3fc" : "#e2e8f0",
                        padding: "8px 12px", borderRadius: 6, maxWidth: "85%",
                        fontSize: 12, fontFamily: "monospace", wordWrap: "break-word"
                    }}>
                        {msg.content}
                    </div>
                ))}
                {isLoading && <div style={{color: "#4a5568", fontSize:12}}>Thinking...</div>}
                <div ref={endOfMessagesRef} />
            </div>
            
            <div style={{padding: 12, borderTop: "1px solid #1e2a3a", display:"flex", gap: 8}}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Ask a question..."
                    style={{
                        flex: 1, background:"#0f1f2e", border:"1px solid #1e2a3a", borderRadius: 6,
                        color: "#e2e8f0", padding: "6px 10px", fontSize: 12, fontFamily: "monospace", outline:"none"
                    }}
                />
                <button onClick={handleSend} style={{...btnStyle,
                    background: "#38bdf8", color: "#080f1a", fontWeight: "bold",
                    padding: "6px 12px", borderRadius: 6}}>
                        Send
                </button>
            </div>
        </div>
    );
};

const btnStyle: React.CSSProperties = {
    background: "transparent", border: "none", color: "#94a3b8", fontSize: 12,
    cursor: "pointer", fontFamily: "monospace"
};
export default AITutor;