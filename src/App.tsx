import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon, MessageSquareIcon, Send, Sparkles, User, Clock, Settings, Info } from "lucide-react";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { format, addHours, isAfter, isBefore, startOfToday } from "date-fns";
import { es } from "date-fns/locale";

interface Appointment {
  id?: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  startTime: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"book" | "chat">("book");
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [hasCreds, setHasCreds] = useState(true);
  
  // App initialization setup
  useEffect(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then(d => {
        setHasCreds(d.hasCredentials);
        setIsAdminAuth(d.isAdminAuthenticated);
        if (window.location.search.includes("admin=true")) {
           setIsAdminAuth(true);
           toast.success("Autenticado con éxito en Google");
        }
      });
  }, []);

  return (
   <div className="w-full min-h-[100dvh] bg-[#121212] flex flex-col justify-center items-center p-0 sm:p-4">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-md h-[100dvh] sm:h-[800px] sm:max-h-[90vh] bg-[#FAF9F6] sm:rounded-[40px] border-0 sm:border-[8px] border-[#1E1E1E] shadow-2xl overflow-hidden flex flex-col relative text-[#1A1A1A]">
        
        {/* Header */}
        <header className="px-6 py-5 flex items-center justify-between bg-transparent z-10">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">Jean Pierre</h1>
            <p className="text-xs font-medium text-[#8E8E8E] uppercase tracking-widest mt-1">Massage Studio</p>
          </div>
          <div className="flex gap-2">
             {!hasCreds && (
               <div title="Falta configurar Google OAuth en .env" className="bg-[#FFF3E0] text-[#FF9800] p-2 rounded-full cursor-pointer shadow-sm">
                 <Settings size={18} />
               </div>
             )}
             {!isAdminAuth && hasCreds && (
               <a href="/api/auth/google" title="Inicia sesión con la cuenta de JPegas para habilitar agenda">
                 <div className="bg-[#FFF3E0] text-[#FF9800] p-2 rounded-full cursor-pointer transition-colors hover:bg-[#FFE0B2] shadow-sm">
                   <Settings size={18} />
                 </div>
               </a>
             )}
            <div className="bg-[#D4C4B5] p-2 rounded-full shadow-sm text-[#2D3E40]">
              <User size={18} />
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === "book" ? (
              <BookingTab key="book" isAdminAuth={isAdminAuth} hasCreds={hasCreds} />
            ) : (
              <ChatTab key="chat" />
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation */}
        <nav className="border-t border-[#F0F0F0] bg-white rounded-t-[32px] px-6 py-4 flex gap-4 z-10 pb-8 sm:pb-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <Button
            variant={activeTab === "book" ? "default" : "ghost"}
            className={`flex-1 h-12 rounded-2xl gap-2 font-bold uppercase tracking-wider text-[10px] ${activeTab === "book" ? "bg-[#2D3E40] text-white hover:bg-[#1E2B2C]" : "text-[#8E8E8E] opacity-70 hover:opacity-100 hover:bg-transparent"}`}
            onClick={() => setActiveTab("book")}
          >
            <CalendarIcon size={18} />
            Turnos
          </Button>
          <Button
            variant={activeTab === "chat" ? "default" : "ghost"}
            className={`flex-1 h-12 rounded-2xl gap-2 font-bold uppercase tracking-wider text-[10px] ${activeTab === "chat" ? "bg-[#2D3E40] text-white hover:bg-[#1E2B2C]" : "text-[#8E8E8E] opacity-70 hover:opacity-100 hover:bg-transparent"}`}
            onClick={() => setActiveTab("chat")}
          >
            <Sparkles size={18} />
            Asistente AI
          </Button>
        </nav>
      </div>
    </div>
  );
}

// ------------------------------
// BOOKING TAB
// ------------------------------
function BookingTab({ isAdminAuth, hasCreds }: { isAdminAuth: boolean, hasCreds: boolean }) {
  const [formData, setFormData] = useState<Appointment>({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    startTime: ""
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startTime) {
      toast.error("Selecciona una fecha y hora");
      return;
    }
    
    setStatus("loading");
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          endTime: new Date(new Date(formData.startTime).getTime() + 60*60*1000).toISOString()
        })
      });

      if (!res.ok) throw new Error("Error en servidor");
      
      setStatus("success");
      toast.success("¡Cita reservada con éxito!");
      setFormData({ clientName: "", clientEmail: "", clientPhone: "", startTime: "" });
      
      setTimeout(() => setStatus("idle"), 3000);
    } catch(err) {
      toast.error("Ocurrió un error al reservar");
      setStatus("idle");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="absolute inset-0 overflow-y-auto no-scrollbar pb-20 bg-[#FAF9F6]"
    >
      <div className="p-6">
         {!isAdminAuth && (
            <div className="mb-6 p-4 rounded-2xl bg-[#FFF3E0] border border-[#FFE0B2] flex items-start gap-3 shadow-sm">
              <Info className="text-[#FF9800] mt-0.5 shrink-0" size={18} />
              <p className="text-sm text-[#FF9800] leading-relaxed font-medium">
                <strong>Modo Demo:</strong> La integración con Google Calendar está deshabilitada porque el administrador no ha iniciado sesión.
              </p>
            </div>
         )}
         
        <h2 className="text-3xl font-serif italic text-[#1A1A1A] mb-1">Reserva un Masaje</h2>
        <p className="text-[#8E8E8E] text-sm mb-8 leading-relaxed font-medium">Selecciona tu horario y prepárate para desconectar. Sesiones de 1 hora.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-[#8E8E8E] uppercase tracking-widest pl-1" htmlFor="name">Tu Nombre</Label>
            <Input 
              id="name" 
              placeholder="Ej. Laura Gómez" 
              className="h-12 rounded-xl bg-white border-[#F0F0F0] shadow-sm text-[#1A1A1A] focus-visible:ring-[#2D3E40]" 
              value={formData.clientName}
              onChange={e => setFormData({...formData, clientName: e.target.value})}
              required
            />
          </div>

          <div className="space-y-2">
             <Label className="text-xs font-bold text-[#8E8E8E] uppercase tracking-widest pl-1" htmlFor="email">Correo Electrónico</Label>
             <Input 
               id="email" 
               type="email"
               placeholder="laura@ejemplo.com" 
               className="h-12 rounded-xl bg-white border-[#F0F0F0] shadow-sm text-[#1A1A1A] focus-visible:ring-[#2D3E40]" 
               value={formData.clientEmail}
               onChange={e => setFormData({...formData, clientEmail: e.target.value})}
               required
             />
          </div>

          <div className="space-y-2">
             <Label className="text-xs font-bold text-[#8E8E8E] uppercase tracking-widest pl-1" htmlFor="phone">Teléfono (opcional)</Label>
             <Input 
               id="phone" 
               type="tel"
               placeholder="+34 600..." 
               className="h-12 rounded-xl bg-white border-[#F0F0F0] shadow-sm text-[#1A1A1A] focus-visible:ring-[#2D3E40]" 
               value={formData.clientPhone}
               onChange={e => setFormData({...formData, clientPhone: e.target.value})}
             />
          </div>

          <div className="space-y-2">
             <Label className="text-xs font-bold text-[#8E8E8E] uppercase tracking-widest pl-1" htmlFor="datetime">Fecha y Hora</Label>
             <div className="relative">
               <Input 
                 id="datetime" 
                 type="datetime-local"
                 className="h-12 rounded-xl bg-white border-[#F0F0F0] shadow-sm pl-10 text-[#1A1A1A] focus-visible:ring-[#2D3E40]" 
                 value={formData.startTime}
                 onChange={e => setFormData({...formData, startTime: e.target.value})}
                 required
               />
               <Clock className="absolute left-3 top-3.5 text-[#8E8E8E]" size={18} />
             </div>
          </div>

          <Button 
             type="submit" 
             disabled={status === "loading" || status === "success"}
             className="w-full h-14 rounded-2xl text-xs font-bold uppercase tracking-wider mt-4 shadow-xl bg-[#2D3E40] text-white hover:bg-[#1E2B2C] transition-all"
          >
             {status === "loading" ? "Procesando..." : status === "success" ? "¡Reservado!" : "Confirmar Cita"}
          </Button>
        </form>
      </div>
    </motion.div>
  );
}

// ------------------------------
// CHAT TAB
// ------------------------------
function ChatTab() {
  const [messages, setMessages] = useState<{ role: "model" | "user", content: string }[]>([
    { role: "model", content: "¡Hola! Soy el asistente virtual de Jean Pierre. ¿En qué puedo ayudarte? Puedes pedirme que te agende una cita o ver disponibilidad." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
     if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
     }
  }, [messages]);

  const handleSend = async () => {
     if (!input.trim() || isLoading) return;
     
     const newMessages = [...messages, { role: "user" as const, content: input }];
     setMessages(newMessages);
     setInput("");
     setIsLoading(true);

     try {
       const res = await fetch("/api/chat", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ messages: newMessages })
       });
       
       if (!res.ok) throw new Error("Error API");
       const data = await res.json();
       
       setMessages(prev => [...prev, { role: "model", content: data.reply }]);
     } catch(e) {
       setMessages(prev => [...prev, { role: "model", content: "Lo siento, tuve un problema de conexión. ¿Podrías repetirlo?" }]);
     } finally {
       setIsLoading(false);
     }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="absolute inset-0 flex flex-col bg-[#FAF9F6]"
    >
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
         <div className="space-y-6 pb-20">
           {messages.map((m, i) => (
             <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
               <div 
                 className={`max-w-[85%] rounded-[24px] px-5 py-4 text-sm leading-relaxed shadow-sm ${
                   m.role === "user" 
                     ? "bg-[#2D3E40] text-white rounded-br-none" 
                     : "bg-white text-[#1A1A1A] border border-[#F0F0F0] rounded-bl-none font-medium"
                 }`}
               >
                 {m.content}
               </div>
             </div>
           ))}
           {isLoading && (
              <div className="flex justify-start">
                 <div className="bg-white text-[#8E8E8E] border border-[#F0F0F0] rounded-[24px] rounded-bl-none px-5 py-4 flex gap-1.5 shadow-sm">
                   <div className="w-2 h-2 bg-[#D4C4B5] rounded-full animate-bounce" />
                   <div className="w-2 h-2 bg-[#D4C4B5] rounded-full animate-bounce [animation-delay:0.2s]" />
                   <div className="w-2 h-2 bg-[#D4C4B5] rounded-full animate-bounce [animation-delay:0.4s]" />
                 </div>
              </div>
           )}
         </div>
      </ScrollArea>
      
      <div className="p-4 bg-white/80 backdrop-blur-md border-t border-[#F0F0F0] absolute bottom-0 left-0 right-0 z-20">
        <div className="relative flex items-center">
          <Input 
             className="h-14 rounded-2xl pr-14 bg-white border-[#F0F0F0] text-[#1A1A1A] shadow-sm focus-visible:ring-[#2D3E40]"
             placeholder="Escribe tu mensaje..."
             value={input}
             onChange={e => setInput(e.target.value)}
             onKeyDown={e => e.key === "Enter" && handleSend()}
          />
          <Button 
            size="icon"
            className="absolute right-1.5 w-11 h-11 rounded-xl bg-[#D4A373] text-white hover:bg-[#C29262] transition-colors"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
             <Send size={16} />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
