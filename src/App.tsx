import React, { useState, useEffect } from "react";
import { Settings, User, Clock, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Phone, Mail, Leaf, MessageCircle, Send, LogOut } from "lucide-react";
import { format, addDays, startOfToday, parseISO, isSameDay, setHours, setMinutes, isBefore } from "date-fns";
import { es } from "date-fns/locale";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Appointment {
  id?: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  startTime: string;
  endTime?: string;
  status?: string;
}

export default function App() {
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [hasCreds, setHasCreds] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [bannerUrl, setBannerUrl] = useState("https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80");
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [bookingSlot, setBookingSlot] = useState<Date | null>(null);
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  // Admin Cancel Modal
  const [cancelPromptAppt, setCancelPromptAppt] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Bot State
  const [showBot, setShowBot] = useState(false);
  const [botStep, setBotStep] = useState<"greeting"|"ask_email"|"ask_verification"|"show_appointments"|"reschedule">("greeting");
  const [botData, setBotData] = useState({ email: "", verification: "", appts: [] as Appointment[], selectedApptId: "" });
  const [botRescheduleSlot, setBotRescheduleSlot] = useState<Date|null>(null);

  // Form State
  const [formData, setFormData] = useState({ clientName: "", clientEmail: "", clientPhone: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then(r => r.json())
      .then(d => {
        setHasCreds(d.hasCredentials);
        
        // El modo admin solo reside en el navegador de Jean Pierre
        const isLocalAdmin = localStorage.getItem("isAdmin") === "true";
        setIsAdminAuth(isLocalAdmin);

        if (window.location.search.includes("admin=true")) {
           setIsAdminAuth(true);
           localStorage.setItem("isAdmin", "true");
           toast.success("Autenticado como Jean Pierre (Admin)", { id: "admin-toast" });
           window.history.replaceState({}, document.title, "/");
        }
      });
      
    fetch("/api/app-config")
      .then(r => r.json())
      .then(d => {
        if (d.bannerUrl) setBannerUrl(d.bannerUrl);
        if (d.startHour !== undefined) setStartHour(d.startHour);
        if (d.endHour !== undefined) setEndHour(d.endHour);
      });
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [selectedDate]);

  const fetchAppointments = async () => {
    try {
      const res = await fetch("/api/appointments");
      const data = await res.json();
      setAppointments(data);
    } catch (e) {
      console.error("Error fetching appointments", e);
    }
  };

  const handleUpdateConfig = async () => {
    try {
      await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerUrl, startHour, endHour })
      });
      toast.success("Configuración actualizada");
    } catch (e) {
      toast.error("Error al actualizar la configuración");
    }
  };

  // Convert uploaded image to base64
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setBannerUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAdmin");
    setIsAdminAuth(false);
    setShowAdminPanel(false);
    toast.success("Sesión cerrada");
  };

  const currentHour = new Date();

  // Generate slots from startHour to endHour (exclusive of endHour for the last slot)
  const slotsLength = Math.max(0, endHour - startHour);
  const slots = Array.from({ length: slotsLength }).map((_, i) => {
    const slotTime = setMinutes(setHours(selectedDate, startHour + i), 0);
    const existingAppt = appointments.find(a => isSameDay(parseISO(a.startTime), slotTime) && parseISO(a.startTime).getHours() === slotTime.getHours());
    // Also consider it passed if it's the current date and time has passed.
    const isPast = selectedDate < startOfToday() || (isSameDay(selectedDate, startOfToday()) && isBefore(slotTime, currentHour));
    
    return {
      time: slotTime,
      isAvailable: !existingAppt && !isPast,
      isPast,
      appointment: existingAppt
    };
  });

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingSlot) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          startTime: bookingSlot.toISOString(),
          endTime: new Date(bookingSlot.getTime() + 60*60*1000).toISOString()
        })
      });

      if (!res.ok) throw new Error("Error en servidor");
      toast.success("¡Cita reservada con éxito!");
      setBookingSlot(null);
      setFormData({ clientName: "", clientEmail: "", clientPhone: "" });
      fetchAppointments();
    } catch(err) {
      toast.error("Ocurrió un error al reservar");
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleCancelApptClick = (e: React.MouseEvent, appt: Appointment) => {
     e.stopPropagation();
     setCancelPromptAppt(appt);
  };

  const submitCancelAppt = async () => {
    if (!cancelPromptAppt) return;
    setIsSubmitting(true);
    try {
      await fetch(`/api/appointments/${cancelPromptAppt.id}`, { 
         method: 'DELETE',
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ reason: cancelReason })
      });
      toast.success("Cita cancelada y el cliente ha sido notificado.");
      setCancelPromptAppt(null);
      setCancelReason("");
      setViewingAppt(null);
      fetchAppointments();
    } catch(e) {
      toast.error("Error al cancelar");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyBotIdentity = async () => {
    try {
       const r = await fetch("/api/bot/verify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: botData.email, verification: botData.verification })
       });
       if (!r.ok) {
          toast.error("No se encontraron citas con esos datos.");
          setBotStep("greeting");
          setBotData({ email: "", verification: "", appts: [], selectedApptId: "" });
          return;
       }
       const data = await r.json();
       setBotData(prev => ({...prev, appts: data}));
       setBotStep("show_appointments");
    } catch(e) {
       toast.error("Error al consultar citas.");
    }
  };

  const botCancelAppt = async (id: string) => {
     try {
        await fetch(`/api/appointments/${id}`, { method: 'DELETE', headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Cancelado por el cliente desde el Asistente virtual." }) });
        toast.success("Cita cancelada con éxito");
        setBotData(prev => ({...prev, appts: prev.appts.filter(a => a.id !== id)}));
        fetchAppointments();
        if (botData.appts.length <= 1) setShowBot(false);
     } catch(e) {
        toast.error("Error");
     }
  };

  const botRescheduleAppt = async () => {
     if (!botRescheduleSlot || !botData.selectedApptId) return;
     try {
        const r = await fetch(`/api/bot/appointments/${botData.selectedApptId}/reschedule`, {
           method: "POST", headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ newStartTime: botRescheduleSlot.toISOString() })
        });
        if(r.ok) {
           toast.success("¡Tu cita ha sido reagendada con éxito!");
           setBotStep("show_appointments");
           setBotRescheduleSlot(null);
           setShowBot(false);
           fetchAppointments();
        } else { toast.error("Error al reagendar"); }
     } catch(e) { toast.error("Error al reagendar"); }
  };

  const morningSlots = slots.filter(s => s.time.getHours() < 14);
  const afternoonSlots = slots.filter(s => s.time.getHours() >= 14);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const renderSlot = (slot: typeof slots[0]) => {
    return (
      <motion.button
        variants={itemVariants}
        key={slot.time.toISOString()}
        onClick={() => {
          if (botStep === "reschedule" && slot.isAvailable) {
             setBotRescheduleSlot(slot.time);
          } else if (isAdminAuth && slot.appointment) {
            setViewingAppt(slot.appointment);
          } else if (slot.isAvailable) {
            setBookingSlot(slot.time);
          }
        }}
        disabled={(!slot.isAvailable && !isAdminAuth) || slot.isPast}
        className={cn(
          "relative flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-500 border outline-none",
          slot.isAvailable && "bg-[#1E2520]/80 hover:bg-[#1E2520] border-[#8F7256]/30 shadow-sm hover:shadow-[0_8px_20px_rgba(143,114,86,0.15)] cursor-pointer text-[#F9F8F6] hover:border-[#8F7256] scale-100 hover:scale-[1.02]",
          !slot.isAvailable && !slot.isPast && isAdminAuth && "bg-[#1C201D] cursor-pointer border-[#8F7256]/40 hover:border-[#8F7256]",
          !slot.isAvailable && !slot.isPast && !isAdminAuth && "bg-transparent border-[#8F7256]/20 cursor-not-allowed opacity-50",
          slot.isPast && "bg-transparent border-transparent opacity-20 cursor-not-allowed text-[#F9F8F6]"
        )}
      >
        <div className="flex flex-col flex-1 items-center justify-center w-full relative">
          {slot.isAvailable && (
            <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-[#8F7256] animate-pulse" />
          )}
          {!slot.isAvailable && !slot.isPast && (
            <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-rose-500" />
          )}

          <span className={cn(
            "text-2xl font-serif mb-1",
            (slot.isAvailable || (isAdminAuth && slot.appointment)) ? "text-[#F9F8F6]" : "text-[#7A7D7B]"
          )}>
            {format(slot.time, "HH:mm")}
          </span>
          
          {isAdminAuth && slot.appointment ? (
            <span className="text-[10px] font-medium text-[#8F7256] mt-0.5 truncate w-full px-1 text-center">
              {slot.appointment.clientName.split(" ")[0]}
            </span>
          ) : (
            <span className={cn(
              "text-[9px] font-sans font-semibold uppercase tracking-widest mt-0.5",
               slot.isAvailable ? "text-[#8F7256]" : "text-[#7A7D7B]"
            )}>
              {slot.isPast ? "Pasado" : (slot.isAvailable ? "Reservar" : "Ocupado")}
            </span>
          )}
        </div>
      </motion.button>
    );
  };

  return (
    <div className="w-full min-h-[100dvh] bg-[#0E1410] flex flex-col items-center sm:p-6 font-sans text-[#F9F8F6]">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-md min-h-[100dvh] sm:min-h-[850px] sm:h-[850px] sm:max-h-[96vh] bg-[#141A16] sm:rounded-[40px] shadow-2xl flex flex-col relative ring-1 ring-white/5 overflow-hidden">
        
        {/* Minimalist Hero */}
        <div className="relative h-64 w-full shrink-0">
          <img 
            src={bannerUrl} 
            alt="Spa Detail" 
            className="w-full h-full object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#141A16] via-[#141A16]/50 to-black/40" />
          
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
            <div className="flex gap-2 ml-auto">
               {!hasCreds && (
                 <div title="Falta configurar Google OAuth en .env" className="bg-[#1C201D]/80 backdrop-blur-md text-[#FF9800] p-2.5 rounded-full cursor-pointer shadow-sm">
                   <Settings size={18} strokeWidth={1.5} />
                 </div>
               )}
               {!isAdminAuth && hasCreds && (
                 <a href="/api/auth/google" title="Iniciar sesión como Administrador">
                   <div className="bg-[#1C201D]/80 backdrop-blur-md text-[#F9F8F6] p-2.5 rounded-full cursor-pointer hover:bg-[#8F7256] transition-colors shadow-sm">
                     <Settings size={18} strokeWidth={1.5} />
                   </div>
                 </a>
               )}
               {isAdminAuth && (
                 <div className="flex gap-2">
                   <button onClick={() => setShowAdminPanel(true)} className="bg-[#8F7256] text-[#F9F8F6] p-2.5 rounded-full shadow-md hover:bg-[#A68A6B] transition-colors" title="Abrir Panel de Administrador">
                     <User size={18} strokeWidth={1.5} />
                   </button>
                   <button onClick={handleLogout} className="bg-[#1C201D]/80 backdrop-blur-md text-rose-500 p-2.5 rounded-full shadow-md hover:bg-rose-500 hover:text-[#F9F8F6] transition-all" title="Cerrar Sesión">
                     <LogOut size={18} strokeWidth={1.5} />
                   </button>
                 </div>
               )}
            </div>
          </div>

          <div className="absolute bottom-4 left-8 right-8 z-10 text-center">
            <h1 className="text-4xl font-serif text-[#F9F8F6] drop-shadow-md mb-1 tracking-tight">Jean Pierre</h1>
            <p className="text-[10px] font-bold text-[#8F7256] uppercase tracking-[0.3em] drop-shadow-sm">Massage Studio</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar relative px-8 pb-32 z-10 -mt-2">
          
          {/* Elegant Date Selector */}
          <div className="flex items-center justify-between mb-10 pb-6 border-b border-[#2A352B]">
            <button 
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="p-3 text-[#7A7D7B] hover:text-[#F9F8F6] transition-colors rounded-full hover:bg-[#2A352B] -ml-3"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <div className="text-center flex flex-col items-center">
              <span className="text-[11px] font-medium text-[#8F7256] uppercase tracking-[0.2em] mb-1">
                {format(selectedDate, "EEEE", { locale: es })}
              </span>
              <span className="text-2xl font-serif text-[#F9F8F6]">
                {format(selectedDate, "d MMMM", { locale: es })}
              </span>
            </div>
            <button 
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="p-3 text-[#7A7D7B] hover:text-[#F9F8F6] transition-colors rounded-full hover:bg-[#2A352B] -mr-3"
            >
              <ChevronRight size={24} strokeWidth={1.5} />
            </button>
          </div>

          <div className="space-y-12">
            {/* Morning Slots */}
            <section>
              <h2 className="text-[11px] font-medium text-[#9A9891] uppercase tracking-[0.2em] mb-5 text-center flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-200"></span>
                Turno de Mañana
              </h2>
              <motion.div 
                key={`morning-${selectedDate.toISOString()}`}
                variants={containerVariants} 
                initial="hidden" 
                animate="show" 
                className="grid grid-cols-2 gap-4"
              >
                {morningSlots.map(renderSlot)}
              </motion.div>
            </section>

            {/* Afternoon Slots */}
            <section>
              <h2 className="text-[11px] font-medium text-[#9A9891] uppercase tracking-[0.2em] mb-5 text-center flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8F7256]/40"></span>
                Turno de Tarde
              </h2>
              <motion.div 
                key={`afternoon-${selectedDate.toISOString()}`}
                variants={containerVariants} 
                initial="hidden" 
                animate="show" 
                className="grid grid-cols-2 gap-4"
              >
                {afternoonSlots.map(renderSlot)}
              </motion.div>
            </section>
          </div>
        </div>

        {/* Modals */}
        <AnimatePresence>
          {bookingSlot && (
            <motion.div 
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-x-0 bottom-0 top-[10%] z-50 bg-[#141A16] rounded-t-[40px] shadow-[0_-20px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden border-t border-[#2A352B]"
            >
               <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-[#2A352B]">
                 <h2 className="text-3xl font-serif text-[#F9F8F6]">Tu Reserva</h2>
                 <button onClick={() => setBookingSlot(null)} className="p-3 bg-[#1C201D] rounded-full text-[#7A7D7B] hover:text-[#F9F8F6] shadow-sm transition-colors">
                   <X size={20} strokeWidth={1.5} />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-[#1A221C]/50">
                 <div className="mb-10 p-6 bg-[#1C201D] rounded-3xl flex items-center gap-6 shadow-md border border-[#2A352B]">
                   <div className="w-16 h-16 bg-[#2A352B] rounded-2xl flex items-center justify-center text-[#8F7256]">
                     <CalendarIcon size={28} strokeWidth={1.5} />
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-1.5">{format(bookingSlot, "EEEE d 'de' MMMM", { locale: es })}</p>
                     <p className="text-2xl font-serif text-[#F9F8F6]">{format(bookingSlot, "HH:mm")} <span className="text-[#8F7256] text-xl font-sans mx-2">→</span> {format(addDays(bookingSlot, 0).setHours(bookingSlot.getHours() + 1), "HH:mm")}</p>
                   </div>
                 </div>

                 <form id="booking-form" onSubmit={handleBook} className="space-y-6">
                   <div className="space-y-2">
                     <label className="text-[11px] font-medium text-[#7A7D7B] uppercase tracking-[0.2em] pl-1">Nombre Completo</label>
                     <input 
                       className="w-full h-14 rounded-2xl bg-[#1C201D] border border-[#2A352B] px-5 text-base text-[#F9F8F6] outline-none focus:border-[#8F7256] transition-all placeholder:text-[#4A4D4B]" 
                       placeholder="Ej. Laura Gómez" 
                       value={formData.clientName}
                       onChange={e => setFormData({...formData, clientName: e.target.value})}
                       required
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[11px] font-medium text-[#7A7D7B] uppercase tracking-[0.2em] pl-1">Correo Electrónico</label>
                     <input 
                       type="email"
                       className="w-full h-14 rounded-2xl bg-[#1C201D] border border-[#2A352B] px-5 text-base text-[#F9F8F6] outline-none focus:border-[#8F7256] transition-all placeholder:text-[#4A4D4B]" 
                       placeholder="laura@ejemplo.com" 
                       value={formData.clientEmail}
                       onChange={e => setFormData({...formData, clientEmail: e.target.value})}
                       required
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[11px] font-medium text-[#7A7D7B] uppercase tracking-[0.2em] pl-1">Teléfono (opcional)</label>
                     <input 
                       type="tel"
                       className="w-full h-14 rounded-2xl bg-[#1C201D] border border-[#2A352B] px-5 text-base text-[#F9F8F6] outline-none focus:border-[#8F7256] transition-all placeholder:text-[#4A4D4B]" 
                       placeholder="+34 600 000 000" 
                       value={formData.clientPhone}
                       onChange={e => setFormData({...formData, clientPhone: e.target.value})}
                     />
                   </div>
                 </form>
               </div>
               
               <div className="p-8 pb-10 bg-[#141A16] border-t border-[#2A352B]">
                 <button 
                   form="booking-form"
                   type="submit"
                   disabled={isSubmitting}
                   className="w-full h-16 bg-[#8F7256] text-[#F9F8F6] rounded-2xl text-[13px] font-semibold tracking-[0.2em] uppercase shadow-[0_8px_20px_rgba(143,114,86,0.3)] hover:bg-[#A68A6B] hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                 >
                   {isSubmitting ? "Procesando..." : "Confirmar Reserva"}
                 </button>
               </div>
            </motion.div>
          )}

          {viewingAppt && isAdminAuth && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="absolute inset-0 z-[60] bg-[#0A0C0B]/80 backdrop-blur-md flex items-center justify-center p-4"
               onClick={() => setViewingAppt(null)}
            >
              <div 
                className="w-full max-w-[340px] bg-[#141A16] border border-[#2A352B] rounded-[32px] p-8 shadow-2xl relative"
                onClick={e => e.stopPropagation()}
              >
                 <button onClick={() => setViewingAppt(null)} className="absolute top-6 right-6 p-2 bg-[#1C201D] rounded-full text-[#7A7D7B] hover:text-[#F9F8F6] transition-colors shadow-sm">
                   <X size={18} strokeWidth={1.5} />
                 </button>
                 
                 <div className="w-16 h-16 bg-[#1C201D] border border-[#2A352B] shadow-sm text-[#8F7256] rounded-2xl flex items-center justify-center mb-6">
                   <User size={32} strokeWidth={1.5} />
                 </div>
                 
                 <h3 className="text-3xl font-serif text-[#F9F8F6] mb-2">{viewingAppt.clientName}</h3>
                 <p className="text-[13px] font-medium text-[#7A7D7B] mb-8">{format(parseISO(viewingAppt.startTime), "EEEE d 'de' MMMM, HH:mm", { locale: es })}</p>
                 
                 <div className="space-y-4 mb-10 bg-[#1C201D] p-5 rounded-2xl border border-[#2A352B] shadow-sm">
                   <div className="flex items-center gap-4 text-[#F9F8F6]">
                     <Mail size={20} strokeWidth={1.5} className="text-[#8E8E8E]" />
                     <span className="text-sm font-medium">{viewingAppt.clientEmail}</span>
                   </div>
                   {viewingAppt.clientPhone && (
                     <div className="flex items-center gap-4 text-[#F9F8F6]">
                       <Phone size={20} strokeWidth={1.5} className="text-[#8E8E8E]" />
                       <span className="text-sm font-medium">{viewingAppt.clientPhone}</span>
                     </div>
                   )}
                 </div>
                 
                 <button 
                   onClick={(e) => viewingAppt.id && handleCancelApptClick(e, viewingAppt)}
                   className="w-full h-14 bg-[#1C201D] border border-[#2A352B] text-rose-500 rounded-2xl text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm hover:bg-rose-500/10 hover:border-rose-500/30 transition-colors"
                 >
                   Cancelar Cita
                 </button>
              </div>
            </motion.div>
          )}

          {/* Admin Panel */}
          {showAdminPanel && isAdminAuth && (
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="absolute inset-0 z-[60] bg-[#0A0C0B]/80 backdrop-blur-md flex items-center justify-center p-4"
               onClick={() => setShowAdminPanel(false)}
            >
              <div 
                className="w-full max-w-[380px] h-[80vh] flex flex-col bg-[#141A16] border border-[#2A352B] rounded-[32px] shadow-2xl relative overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                 <div className="p-6 border-b border-[#2A352B] flex justify-between items-center bg-[#1C201D] shrink-0">
                    <h2 className="text-2xl font-serif text-[#F9F8F6]">Panel de Admin</h2>
                    <button onClick={() => setShowAdminPanel(false)} className="p-2 bg-[#2A352B]/40 rounded-full text-[#7A7D7B] hover:text-[#F9F8F6] transition-colors">
                      <X size={18} strokeWidth={1.5} />
                    </button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                    {/* Settings */}
                    <div className="space-y-4">
                       <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#8F7256]">Configuración</h3>
                       
                       <div className="space-y-2">
                           <label className="text-[10px] font-medium text-[#7A7D7B] uppercase tracking-[0.1em] pl-1">Foto principal (Sube desde tu móvil o PC)</label>
                           <input 
                             type="file"
                             accept="image/*"
                             onChange={handleImageUpload}
                             className="w-full text-sm text-[#7A7D7B] file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-[#1C201D] file:text-[#8F7256] hover:file:bg-[#2A352B] cursor-pointer"
                           />
                       </div>

                       <div className="flex gap-4">
                           <div className="flex-1 space-y-2">
                               <label className="text-[10px] font-medium text-[#7A7D7B] uppercase tracking-[0.1em] pl-1">Hora inicio</label>
                               <input type="number" value={startHour} onChange={e=>setStartHour(Number(e.target.value))} className="w-full h-12 rounded-2xl bg-[#1C201D] border border-[#2A352B] px-4 text-sm text-[#F9F8F6] outline-none focus:border-[#8F7256] transition-colors" />
                           </div>
                           <div className="flex-1 space-y-2">
                               <label className="text-[10px] font-medium text-[#7A7D7B] uppercase tracking-[0.1em] pl-1">Hora fin</label>
                               <input type="number" value={endHour} onChange={e=>setEndHour(Number(e.target.value))} className="w-full h-12 rounded-2xl bg-[#1C201D] border border-[#2A352B] px-4 text-sm text-[#F9F8F6] outline-none focus:border-[#8F7256] transition-colors" />
                           </div>
                       </div>

                       <button onClick={handleUpdateConfig} className="mt-4 w-full h-12 bg-[#8F7256] text-[#F9F8F6] rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-[#A68A6B] transition-colors shadow-sm">Guardar Configuración</button>
                    </div>

                    {/* Appointments List */}
                    <div className="space-y-4">
                       <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#8F7256]">Todas las Citas ({appointments.length})</h3>
                       {appointments.length === 0 ? (
                           <p className="text-sm text-[#7A7D7B] text-center py-4 bg-[#1C201D] rounded-2xl border border-[#2A352B]">No hay citas registradas</p>
                       ) : (
                           <div className="space-y-3">
                               {appointments.sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(appt => (
                                   <div key={appt.id} className="bg-[#1C201D] p-5 rounded-2xl border border-[#2A352B] shadow-[0_2px_10px_rgba(0,0,0,0.2)] relative group hover:border-[#8F7256]/50 transition-colors">
                                       <button onClick={(e) => appt.id && handleCancelApptClick(e, appt)} className="absolute top-4 right-4 p-1.5 text-rose-500 bg-rose-500/10 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-rose-500/20 hover:text-rose-400">
                                           <X size={14} strokeWidth={2}/>
                                       </button>
                                       <p className="text-base font-semibold text-[#F9F8F6] pr-8">{appt.clientName}</p>
                                       <p className="text-xs font-bold text-[#8F7256] mb-3">{format(parseISO(appt.startTime), "d MMM yyyy - HH:mm", { locale: es })}</p>
                                       <div className="text-[11px] font-medium text-[#7A7D7B] flex flex-col gap-2">
                                           <span className="flex items-center gap-2"><Mail size={14} className="text-[#D4CFC4]"/> {appt.clientEmail}</span>
                                           {appt.clientPhone && <span className="flex items-center gap-2"><Phone size={14} className="text-[#D4CFC4]"/> {appt.clientPhone}</span>}
                                       </div>
                                   </div>
                               ))}
                           </div>
                       )}
                    </div>
                 </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        <AnimatePresence>
          {/* Bot Floating Button */}
          {!showBot && !isAdminAuth && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                onClick={()=>setShowBot(true)}
                className="fixed bottom-8 right-6 h-14 pl-5 pr-4 bg-[#8F7256] rounded-full shadow-[0_8px_20px_rgba(143,114,86,0.5)] flex items-center justify-center gap-3 text-[#F9F8F6] hover:scale-105 hover:bg-[#A68A6B] transition-transform z-40"
              >
                  <span className="text-sm font-semibold tracking-wide">Gestiona tu cita</span>
                  <MessageCircle fill="#F9F8F6" className="text-[#8F7256]" />
              </motion.button>
          )}

          {/* Bot Interface */}
          {showBot && (
             <motion.div 
               initial={{ opacity: 0, y: 50, scale: 0.95 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               exit={{ opacity: 0, y: 50, scale: 0.95 }}
               className="fixed bottom-8 right-6 w-[320px] sm:w-[340px] max-h-[500px] h-[80vh] sm:h-[500px] bg-[#141A16] border border-[#2A352B] rounded-3xl shadow-2xl flex flex-col z-50 overflow-hidden"
             >
                <div className="px-5 py-4 bg-[#1C201D] border-b border-[#2A352B] flex items-center justify-between shadow-sm z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#2A352B] flex items-center justify-center text-[#8F7256]">
                           <MessageCircle size={16} />
                        </div>
                        <div>
                           <h3 className="text-sm font-bold text-[#F9F8F6]">Asistente</h3>
                           <p className="text-[10px] text-[#7A7D7B] flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> En línea</p>
                        </div>
                    </div>
                    <button onClick={()=>{setShowBot(false); setBotStep('greeting'); setBotRescheduleSlot(null); setBotData({ email: "", verification: "", appts: [], selectedApptId: "" });}} className="p-2 text-[#7A7D7B] hover:bg-[#2A352B] rounded-full transition-colors"><X size={18}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 no-scrollbar flex flex-col gap-4">
                     <div className="self-start max-w-[85%] bg-[#1C201D] p-4 rounded-2xl rounded-tl-sm shadow-sm border border-[#2A352B] text-sm text-[#F9F8F6]">
                         Hola, puedo ayudarte a gestionar tus citas sin tener que buscar correos.
                     </div>
                     
                     {botStep === 'greeting' && (
                         <div className="self-end flex flex-col gap-2 w-full mt-2">
                            <button onClick={()=>setBotStep('ask_email')} className="bg-[#8F7256] p-3 rounded-2xl rounded-br-sm text-[#F9F8F6] text-sm text-left shadow-sm hover:bg-[#A68A6B] transition-colors">Gestión rápida de cita</button>
                         </div>
                     )}

                     {(botStep === 'ask_email' || botStep === 'ask_verification' || botStep === 'show_appointments' || botStep === 'reschedule') && (
                         <>
                            <div className="self-end max-w-[85%] bg-[#8F7256] p-3 rounded-2xl rounded-br-sm shadow-sm text-sm text-[#F9F8F6]">Quiero gestionar mi cita</div>
                            <div className="self-start max-w-[85%] bg-[#1C201D] p-4 rounded-2xl rounded-tl-sm shadow-sm border border-[#2A352B] text-sm text-[#F9F8F6] flex flex-col">
                                Escribe el <strong className="text-[#8F7256]">Correo electrónico</strong> que utilizaste para reservar.
                            </div>
                         </>
                     )}

                     {botStep === 'ask_email' && (
                            <div className="flex gap-2">
                                <input className="flex-1 bg-[#1C201D] border border-[#2A352B] rounded-xl px-3 py-2 text-sm text-[#F9F8F6] outline-none w-0 focus:border-[#8F7256]" placeholder="Tu correo..." value={botData.email} onChange={e=>setBotData({...botData, email: e.target.value})} onKeyDown={e=> e.key === 'Enter' && setBotStep('ask_verification')} />
                                <button onClick={()=>setBotStep('ask_verification')} className="w-10 bg-[#8F7256] text-[#F9F8F6] rounded-xl flex items-center justify-center shrink-0 hover:bg-[#A68A6B] transition-colors"><Send size={14}/></button>
                             </div>
                     )}

                     {(botStep === 'ask_verification' || botStep === 'show_appointments' || botStep === 'reschedule') && (
                         <>
                            <div className="self-end max-w-[85%] bg-[#8F7256] p-3 rounded-2xl rounded-br-sm shadow-sm text-sm text-[#F9F8F6] truncate overflow-hidden text-ellipsis">{botData.email}</div>
                            <div className="self-start max-w-[85%] bg-[#1C201D] p-4 rounded-2xl rounded-tl-sm shadow-sm border border-[#2A352B] text-sm text-[#F9F8F6]">
                                Por seguridad, indica tu <strong className="text-[#8F7256]">Número de teléfono</strong> (o Nombre completo si no usaste).
                            </div>
                         </>
                     )}

                     {botStep === 'ask_verification' && (
                            <div className="flex gap-2">
                                <input className="flex-1 bg-[#1C201D] border border-[#2A352B] rounded-xl px-3 py-2 text-sm text-[#F9F8F6] outline-none w-0 focus:border-[#8F7256]" placeholder="Verificación..." value={botData.verification} onChange={e=>setBotData({...botData, verification: e.target.value})} onKeyDown={e=> e.key === 'Enter' && verifyBotIdentity()} />
                                <button onClick={verifyBotIdentity} className="w-10 bg-[#8F7256] text-[#F9F8F6] rounded-xl flex items-center justify-center shrink-0 hover:bg-[#A68A6B] transition-colors"><Send size={14}/></button>
                            </div>
                     )}

                     {(botStep === 'show_appointments' || botStep === 'reschedule') && (
                         <>
                            <div className="self-end max-w-[85%] bg-[#8F7256] p-3 rounded-2xl rounded-br-sm shadow-sm text-sm text-[#F9F8F6] max-w-[200px] truncate overflow-hidden text-ellipsis">Verificación enviada</div>
                            <div className="self-start w-full bg-[#1C201D] p-4 rounded-2xl rounded-tl-sm shadow-sm border border-[#2A352B] text-sm text-[#F9F8F6]">
                                ¡Tus citas! Elige cuál deseas gestionar:
                            </div>
                            <div className="flex flex-col gap-3">
                               {botData.appts.map(ap => (
                                   <div key={ap.id!} className={cn("bg-[#1A221C] border text-sm p-4 rounded-2xl shadow-sm transition-colors", botData.selectedApptId === ap.id ? "border-[#8F7256]" : "border-[#2A352B]")}>
                                      <p className="font-semibold text-[#F9F8F6] text-base">{format(parseISO(ap.startTime), "d MMM, HH:mm", {locale: es})}</p>
                                      <div className="flex gap-2 mt-3">
                                          <button onClick={()=>{ if(window.confirm('¿Cancelar tu cita definitivamente?')) { botCancelAppt(ap.id!); } }} className="flex-1 text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl py-2 font-medium hover:bg-rose-500/20 transition-colors">Cancelar</button>
                                          <button onClick={()=>{setBotData({...botData, selectedApptId: ap.id!}); setBotStep('reschedule');}} className="flex-1 text-[#F9F8F6] bg-[#2A352B] border border-[#2A352B] rounded-xl py-2 font-medium hover:bg-[#1E2520] transition-colors">Reagendar</button>
                                      </div>
                                   </div>
                               ))}
                            </div>
                         </>
                     )}

                     {botStep === 'reschedule' && (
                         <>
                            <div className="self-start max-w-[85%] bg-[#1C201D] p-4 rounded-2xl rounded-tl-sm shadow-sm border border-[#2A352B] text-sm text-[#F9F8F6]">
                                Selecciona <strong className="text-[#8F7256]">en el calendario principal de abajo</strong> el nuevo horario que prefieras.
                            </div>
                            <div className="bg-[#1C201D] p-4 rounded-2xl shadow-sm border border-[#2A352B] text-sm flex flex-col items-center">
                               {botRescheduleSlot ? (
                                  <div className="w-full">
                                     <p className="font-bold text-lg text-[#F9F8F6] text-center mb-3">Nueva fecha: <br/><span className="text-[#8F7256]">{format(botRescheduleSlot, "d MMM, HH:mm", {locale: es})}</span></p>
                                     <button onClick={botRescheduleAppt} className="w-full bg-[#8F7256] text-[#F9F8F6] py-3 rounded-xl font-semibold shadow-[0_4px_12px_rgba(143,114,86,0.3)] hover:scale-[1.02] hover:bg-[#A68A6B] transition-all">Confirmar Cambio</button>
                                  </div>
                               ) : (
                                  <p className="w-full bg-[#2A352B]/50 text-[#8F7256] text-center p-3 rounded-xl border border-dashed border-[#8F7256]/30 animate-pulse">Esperando tu selección en el calendario...</p>
                               )}
                               <button onClick={()=>setBotStep('show_appointments')} className="text-xs text-[#7A7D7B] hover:text-[#F9F8F6] underline mt-4">Cancelar reagendamiento</button>
                            </div>
                         </>
                     )}
                </div>
             </motion.div>
          )}

          {/* Admin Cancel Prompt */}
            {cancelPromptAppt && (
               <motion.div 
                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                 className="fixed inset-0 z-[70] bg-[#0A0C0B]/80 backdrop-blur-md flex items-center justify-center p-4"
               >
                  <motion.div 
                    initial={{ y: 20, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, scale: 0.95 }}
                    className="bg-[#141A16] rounded-[32px] p-6 w-full max-w-[340px] shadow-2xl relative border border-[#2A352B]" 
                    onClick={e=>e.stopPropagation()}
                  >
                      <h3 className="text-2xl font-serif text-[#F9F8F6] mb-2">Cancelar Cita</h3>
                      <p className="text-sm font-medium text-[#7A7D7B] mb-6">Escribe un mensaje explicando el motivo para mandarle al cliente por correo (opcional):</p>
                      <textarea 
                         className="w-full h-28 rounded-2xl bg-[#1C201D] border border-[#2A352B] p-4 text-sm text-[#F9F8F6] outline-none focus:border-[#8F7256] focus:ring-4 focus:ring-[#8F7256]/10 transition-all resize-none mb-6 shadow-sm placeholder:text-[#4A4D4B]"
                         placeholder="Ej: Lo siento, me ha surgido un imprevisto familiar y no podré atenderte..."
                         value={cancelReason}
                         onChange={e=>setCancelReason(e.target.value)}
                      />
                      <div className="flex gap-3">
                          <button onClick={()=>setCancelPromptAppt(null)} className="flex-1 py-3.5 bg-[#1C201D] border border-[#2A352B] shadow-sm rounded-2xl text-sm font-semibold text-[#7A7D7B] hover:text-[#F9F8F6] transition-colors">Atrás</button>
                          <button onClick={submitCancelAppt} disabled={isSubmitting} className="flex-1 py-3.5 bg-rose-500 rounded-2xl text-[13px] font-semibold tracking-[0.1em] uppercase text-[#F9F8F6] hover:bg-rose-600 transition-colors shadow-[0_4px_12px_rgba(244,63,94,0.3)] hover:shadow-[0_4px_16px_rgba(244,63,94,0.4)] hover:-translate-y-0.5">Confirmar</button>
                      </div>
                  </motion.div>
               </motion.div>
            )}
        </AnimatePresence>

      </div>
    </div>
  );
}


