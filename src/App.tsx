import React, { useState, useEffect } from "react";
import { Settings, User, Clock, ChevronLeft, ChevronRight, X, Calendar as CalendarIcon, Phone, Mail, Leaf } from "lucide-react";
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
  
  const [selectedDate, setSelectedDate] = useState<Date>(startOfToday());
  const [bookingSlot, setBookingSlot] = useState<Date | null>(null);
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

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

  const handleUpdateBanner = async () => {
    try {
      await fetch("/api/app-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bannerUrl })
      });
      toast.success("Imagen actualizada");
    } catch (e) {
      toast.error("Error al actualizar la imagen");
    }
  };

  const currentHour = new Date();

  // Generate slots from 09:00 to 18:00 (last slot at 17:00)
  const slots = Array.from({ length: 9 }).map((_, i) => {
    const slotTime = setMinutes(setHours(selectedDate, 9 + i), 0);
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

  const handleCancelAppt = async (e: React.MouseEvent, id: string) => {
     e.stopPropagation();
     if (!window.confirm("¿Seguro que deseas cancelar esta cita?")) return;
     try {
       await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
       toast.success("Cita cancelada");
       setViewingAppt(null);
       fetchAppointments();
     } catch (e) {
       toast.error("Error al cancelar");
     }
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
          if (isAdminAuth && slot.appointment) {
            setViewingAppt(slot.appointment);
          } else if (slot.isAvailable) {
            setBookingSlot(slot.time);
          }
        }}
        disabled={(!slot.isAvailable && !isAdminAuth) || slot.isPast}
        className={cn(
          "relative flex flex-col items-center justify-center p-4 rounded-2xl transition-all duration-500 border border-transparent outline-none",
          slot.isAvailable && "bg-white/80 hover:bg-white border-[#E8E6E0] shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(42,53,43,0.08)] cursor-pointer text-[#2A352B] scale-100 hover:scale-[1.02]",
          !slot.isAvailable && !slot.isPast && isAdminAuth && "bg-[#F4F1E9] cursor-pointer border-[#D4CFC4] hover:border-[#2A352B]",
          !slot.isAvailable && !slot.isPast && !isAdminAuth && "bg-transparent border-[#E8E6E0] cursor-not-allowed opacity-50",
          slot.isPast && "bg-transparent border-transparent opacity-30 cursor-not-allowed"
        )}
      >
        <div className="flex flex-col flex-1 items-center justify-center w-full relative">
          {slot.isAvailable && (
            <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
          )}
          {!slot.isAvailable && !slot.isPast && (
            <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-rose-400" />
          )}

          <span className={cn(
            "text-2xl font-serif mb-1",
            (slot.isAvailable || (isAdminAuth && slot.appointment)) ? "text-[#2A352B]" : "text-[#7A7D7B]"
          )}>
            {format(slot.time, "HH:mm")}
          </span>
          
          {isAdminAuth && slot.appointment ? (
            <span className="text-[10px] font-medium text-[#8F7256] mt-0.5 truncate w-full px-1 text-center">
              {slot.appointment.clientName.split(" ")[0]}
            </span>
          ) : (
            <span className="text-[9px] font-sans font-semibold text-[#8E8E8E] uppercase tracking-widest mt-0.5">
              {slot.isPast ? "Pasado" : (slot.isAvailable ? "Reservar" : "Ocupado")}
            </span>
          )}
        </div>
      </motion.button>
    );
  };

  return (
    <div className="w-full min-h-[100dvh] bg-[#0A0C0B] flex flex-col items-center sm:p-6 font-sans text-[#2A352B]">
      <Toaster position="top-center" richColors />
      <div className="w-full max-w-md min-h-[100dvh] sm:min-h-[850px] sm:max-h-[90vh] bg-[#F9F8F6] sm:rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative ring-1 ring-white/10">
        
        {/* Minimalist Hero */}
        <div className="relative h-64 w-full shrink-0">
          <img 
            src={bannerUrl} 
            alt="Spa Detail" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#F9F8F6] via-[#F9F8F6]/40 to-black/20" />
          
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
            <div className="flex gap-2 ml-auto">
               {!hasCreds && (
                 <div title="Falta configurar Google OAuth en .env" className="bg-white/40 backdrop-blur-md text-[#FF9800] p-2.5 rounded-full cursor-pointer shadow-sm">
                   <Settings size={18} strokeWidth={1.5} />
                 </div>
               )}
               {!isAdminAuth && hasCreds && (
                 <a href="/api/auth/google" title="Iniciar sesión como Administrador">
                   <div className="bg-white/40 backdrop-blur-md text-[#2A352B] p-2.5 rounded-full cursor-pointer hover:bg-white transition-colors shadow-sm">
                     <Settings size={18} strokeWidth={1.5} />
                   </div>
                 </a>
               )}
               {isAdminAuth && (
                 <button onClick={() => setShowAdminPanel(true)} className="bg-[#2A352B] text-[#F9F8F6] p-2.5 rounded-full shadow-md hover:bg-[#1C241D] transition-colors" title="Abrir Panel de Administrador">
                   <User size={18} strokeWidth={1.5} />
                 </button>
               )}
            </div>
          </div>

          <div className="absolute bottom-4 left-8 right-8 z-10 text-center">
            <h1 className="text-4xl font-serif text-[#2A352B] drop-shadow-sm mb-1 tracking-tight">Jean Pierre</h1>
            <p className="text-[10px] font-bold text-[#8F7256] uppercase tracking-[0.3em]">Massage Studio</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar relative px-8 pb-12 z-10 -mt-2">
          
          {/* Elegant Date Selector */}
          <div className="flex items-center justify-between mb-10 pb-6 border-b border-[#E8E6E0]">
            <button 
              onClick={() => setSelectedDate(addDays(selectedDate, -1))}
              className="p-3 text-[#7A7D7B] hover:text-[#2A352B] transition-colors rounded-full hover:bg-[#F4F1E9] -ml-3"
            >
              <ChevronLeft size={24} strokeWidth={1.5} />
            </button>
            <div className="text-center flex flex-col items-center">
              <span className="text-[11px] font-medium text-[#9A9891] uppercase tracking-[0.2em] mb-1">
                {format(selectedDate, "EEEE", { locale: es })}
              </span>
              <span className="text-2xl font-serif text-[#2A352B]">
                {format(selectedDate, "d MMMM", { locale: es })}
              </span>
            </div>
            <button 
              onClick={() => setSelectedDate(addDays(selectedDate, 1))}
              className="p-3 text-[#7A7D7B] hover:text-[#2A352B] transition-colors rounded-full hover:bg-[#F4F1E9] -mr-3"
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
              className="absolute inset-x-0 bottom-0 top-[10%] z-50 bg-[#F9F8F6] rounded-t-[40px] shadow-[0_-20px_40px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden border-t border-white"
            >
               <div className="px-8 pt-8 pb-4 flex items-center justify-between border-b border-[#E8E6E0]">
                 <h2 className="text-3xl font-serif text-[#2A352B]">Tu Reserva</h2>
                 <button onClick={() => setBookingSlot(null)} className="p-3 bg-white rounded-full text-[#7A7D7B] hover:text-[#2A352B] shadow-sm transition-colors">
                   <X size={20} strokeWidth={1.5} />
                 </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-8 no-scrollbar bg-white/50">
                 <div className="mb-10 p-6 bg-white rounded-3xl flex items-center gap-6 shadow-[0_2px_15px_rgba(0,0,0,0.03)] border border-[#E8E6E0]">
                   <div className="w-16 h-16 bg-[#F4F1E9] rounded-2xl flex items-center justify-center text-[#8F7256]">
                     <CalendarIcon size={28} strokeWidth={1.5} />
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-[#8E8E8E] uppercase tracking-widest mb-1.5">{format(bookingSlot, "EEEE d 'de' MMMM", { locale: es })}</p>
                     <p className="text-2xl font-serif text-[#2A352B]">{format(bookingSlot, "HH:mm")} <span className="text-[#D4CFC4] text-xl font-sans mx-2">→</span> {format(addDays(bookingSlot, 0).setHours(bookingSlot.getHours() + 1), "HH:mm")}</p>
                   </div>
                 </div>

                 <form id="booking-form" onSubmit={handleBook} className="space-y-6">
                   <div className="space-y-2">
                     <label className="text-[11px] font-medium text-[#9A9891] uppercase tracking-[0.2em] pl-1">Nombre Completo</label>
                     <input 
                       className="w-full h-14 rounded-2xl bg-white border border-[#E8E6E0] px-5 text-base text-[#2A352B] outline-none focus:border-[#8F7256] focus:ring-4 focus:ring-[#8F7256]/10 transition-all placeholder:text-[#D4CFC4]" 
                       placeholder="Ej. Laura Gómez" 
                       value={formData.clientName}
                       onChange={e => setFormData({...formData, clientName: e.target.value})}
                       required
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[11px] font-medium text-[#9A9891] uppercase tracking-[0.2em] pl-1">Correo Electrónico</label>
                     <input 
                       type="email"
                       className="w-full h-14 rounded-2xl bg-white border border-[#E8E6E0] px-5 text-base text-[#2A352B] outline-none focus:border-[#8F7256] focus:ring-4 focus:ring-[#8F7256]/10 transition-all placeholder:text-[#D4CFC4]" 
                       placeholder="laura@ejemplo.com" 
                       value={formData.clientEmail}
                       onChange={e => setFormData({...formData, clientEmail: e.target.value})}
                       required
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[11px] font-medium text-[#9A9891] uppercase tracking-[0.2em] pl-1">Teléfono (opcional)</label>
                     <input 
                       type="tel"
                       className="w-full h-14 rounded-2xl bg-white border border-[#E8E6E0] px-5 text-base text-[#2A352B] outline-none focus:border-[#8F7256] focus:ring-4 focus:ring-[#8F7256]/10 transition-all placeholder:text-[#D4CFC4]" 
                       placeholder="+34 600 000 000" 
                       value={formData.clientPhone}
                       onChange={e => setFormData({...formData, clientPhone: e.target.value})}
                     />
                   </div>
                 </form>
               </div>
               
               <div className="p-8 pb-10 bg-[#F9F8F6] border-t border-[#E8E6E0]">
                 <button 
                   form="booking-form"
                   type="submit"
                   disabled={isSubmitting}
                   className="w-full h-16 bg-[#2A352B] text-[#F9F8F6] rounded-2xl text-[13px] font-semibold tracking-[0.2em] uppercase shadow-[0_8px_20px_rgba(42,53,43,0.3)] hover:bg-[#1C241D] hover:shadow-[0_4px_10px_rgba(42,53,43,0.4)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
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
               className="absolute inset-0 z-[60] bg-[#0A0C0B]/60 backdrop-blur-md flex items-center justify-center p-4"
               onClick={() => setViewingAppt(null)}
            >
              <div 
                className="w-full max-w-[340px] bg-[#F9F8F6] rounded-[32px] p-8 shadow-2xl relative"
                onClick={e => e.stopPropagation()}
              >
                 <button onClick={() => setViewingAppt(null)} className="absolute top-6 right-6 p-2 bg-white rounded-full text-[#7A7D7B] hover:text-[#2A352B] transition-colors shadow-sm">
                   <X size={18} strokeWidth={1.5} />
                 </button>
                 
                 <div className="w-16 h-16 bg-white shadow-sm text-[#8F7256] rounded-2xl flex items-center justify-center mb-6">
                   <User size={32} strokeWidth={1.5} />
                 </div>
                 
                 <h3 className="text-3xl font-serif text-[#2A352B] mb-2">{viewingAppt.clientName}</h3>
                 <p className="text-[13px] font-medium text-[#7A7D7B] mb-8">{format(parseISO(viewingAppt.startTime), "EEEE d 'de' MMMM, HH:mm", { locale: es })}</p>
                 
                 <div className="space-y-4 mb-10 bg-white p-5 rounded-2xl border border-[#E8E6E0] shadow-sm">
                   <div className="flex items-center gap-4 text-[#2A352B]">
                     <Mail size={20} strokeWidth={1.5} className="text-[#8E8E8E]" />
                     <span className="text-sm font-medium">{viewingAppt.clientEmail}</span>
                   </div>
                   {viewingAppt.clientPhone && (
                     <div className="flex items-center gap-4 text-[#2A352B]">
                       <Phone size={20} strokeWidth={1.5} className="text-[#8E8E8E]" />
                       <span className="text-sm font-medium">{viewingAppt.clientPhone}</span>
                     </div>
                   )}
                 </div>
                 
                 <button 
                   onClick={(e) => viewingAppt.id && handleCancelAppt(e, viewingAppt.id)}
                   className="w-full h-14 bg-white border border-[#E8E6E0] text-rose-500 rounded-2xl text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm hover:bg-rose-50 hover:border-rose-200 transition-colors"
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
               className="absolute inset-0 z-[60] bg-[#0A0C0B]/60 backdrop-blur-md flex items-center justify-center p-4"
               onClick={() => setShowAdminPanel(false)}
            >
              <div 
                className="w-full max-w-[380px] h-[80vh] flex flex-col bg-[#F9F8F6] rounded-[32px] shadow-2xl relative overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                 <div className="p-6 border-b border-[#E8E6E0] flex justify-between items-center bg-white shrink-0">
                    <h2 className="text-2xl font-serif text-[#2A352B]">Panel de Admin</h2>
                    <button onClick={() => setShowAdminPanel(false)} className="p-2 bg-[#F4F1E9] rounded-full text-[#7A7D7B] hover:text-[#2A352B] transition-colors">
                      <X size={18} strokeWidth={1.5} />
                    </button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                    {/* Settings */}
                    <div className="space-y-3">
                       <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9A9891]">Diseño Principal</h3>
                       <div className="space-y-2">
                           <label className="text-[10px] font-medium text-[#9A9891] uppercase tracking-[0.1em] pl-1">URL de la foto principal</label>
                           <input 
                             className="w-full h-12 rounded-2xl bg-white border border-[#E8E6E0] px-4 text-sm text-[#2A352B] outline-none focus:border-[#8F7256] transition-colors" 
                             placeholder="https://..." 
                             value={bannerUrl}
                             onChange={e => setBannerUrl(e.target.value)}
                           />
                           <button onClick={handleUpdateBanner} className="mt-2 w-full h-10 bg-[#2A352B] text-white rounded-xl text-xs font-semibold uppercase tracking-wider hover:bg-[#1C241D] transition-colors">Guardar Foto</button>
                       </div>
                    </div>

                    {/* Appointments List */}
                    <div className="space-y-4">
                       <h3 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9A9891]">Todas las Citas ({appointments.length})</h3>
                       {appointments.length === 0 ? (
                           <p className="text-sm text-[#7A7D7B] text-center py-4 bg-white rounded-2xl border border-[#E8E6E0]">No hay citas registradas</p>
                       ) : (
                           <div className="space-y-3">
                               {appointments.sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).map(appt => (
                                   <div key={appt.id} className="bg-white p-5 rounded-2xl border border-[#E8E6E0] shadow-[0_2px_10px_rgba(0,0,0,0.02)] relative group hover:border-[#8F7256]/50 transition-colors">
                                       <button onClick={(e) => appt.id && handleCancelAppt(e, appt.id)} className="absolute top-4 right-4 p-1.5 text-rose-400 bg-rose-50 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-rose-100 hover:text-rose-600">
                                           <X size={14} strokeWidth={2}/>
                                       </button>
                                       <p className="text-base font-semibold text-[#2A352B] pr-8">{appt.clientName}</p>
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

      </div>
    </div>
  );
}


