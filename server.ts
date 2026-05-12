import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import { GoogleGenAI, Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";

// We keep a simple in-memory store for the prototype.
// In production, use Firebase, Postgres, etc.
interface Appointment {
  id: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  startTime: string; // ISO
  endTime: string; // ISO
  status: "confirmed" | "cancelled";
  eventId?: string; // Google Calendar Event ID
}

let appointments: Appointment[] = [];
let adminTokens: any = null;
let appConfig = {
  bannerUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80",
  startHour: 9,
  endHour: 18
};

const PORT = 3000;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const calendar = google.calendar({ version: "v3", auth: oauth2Client });
const gmail = google.gmail({ version: "v1", auth: oauth2Client });

// Setup Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  // === API ROUTES ===

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/app-config", (req, res) => {
    res.json(appConfig);
  });

  app.put("/api/app-config", (req, res) => {
    const { bannerUrl, startHour, endHour } = req.body;
    if (bannerUrl) appConfig.bannerUrl = bannerUrl;
    if (startHour !== undefined) appConfig.startHour = Number(startHour);
    if (endHour !== undefined) appConfig.endHour = Number(endHour);
    res.json(appConfig);
  });

  app.get("/api/config", (req, res) => {
    res.json({ 
      hasCredentials: !!(CLIENT_ID && CLIENT_SECRET),
      isGoogleConnected: !!adminTokens 
    });
  });

  // Admin OAuth flow
  app.get("/api/auth/google", (req, res) => {
    if (!CLIENT_ID) {
       return res.status(500).send("Falta GOOGLE_CLIENT_ID en variables de entorno.");
    }
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email"
      ]
    });
    res.redirect(url);
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const code = req.query.code as string;
    if (code) {
      try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        
        const oauth2 = google.oauth2({ auth: oauth2Client, version: "v2" });
        const userInfo = await oauth2.userinfo.get();
        const userEmail = userInfo.data.email;
        
        const authorizedEmail = process.env.ADMIN_EMAIL;
        
        if (!authorizedEmail) {
          return res.status(500).send("Error de configuración: Debes configurar la variable de entorno ADMIN_EMAIL con tu correo de Google para habilitar el acceso de administrador.");
        }
        
        if (userEmail !== authorizedEmail) {
          return res.status(403).send(`Acceso denegado: El correo ${userEmail} no está configurado como administrador.`);
        }

        adminTokens = tokens;
        res.redirect("/?admin=true");
      } catch (e) {
        res.status(500).send("Error en la autenticación: " + String(e));
      }
    } else {
      res.redirect("/");
    }
  });

  // Appointments API
  app.get("/api/appointments", (req, res) => {
    res.json(appointments);
  });

  app.post("/api/appointments", async (req, res) => {
    const { clientName, clientEmail, clientPhone, startTime, endTime } = req.body;
    
    // Validations
    if (!clientName || !clientEmail || !startTime || !endTime) {
      return res.status(400).json({ error: "Faltan datos requeridos." });
    }

    const newAppt: Appointment = {
      id: uuidv4(),
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      status: "confirmed"
    };

    // Integrate with real Google Calendar if authenticated
    if (adminTokens) {
      try {
        const event = await calendar.events.insert({
          calendarId: "primary",
          requestBody: {
            summary: `Masaje: ${clientName}`,
            description: `Teléfono: ${clientPhone}\nEmail: ${clientEmail}`,
            start: { dateTime: startTime, timeZone: "Europe/Madrid" },
            end: { dateTime: endTime, timeZone: "Europe/Madrid" },
            attendees: [{ email: clientEmail }]
          }
        });
        newAppt.eventId = event.data.id!;
        
        // Get admin email
        const profile = await gmail.users.getProfile({ userId: "me" });
        const adminEmail = profile.data.emailAddress;

        // Send confirmation email to client
        const messageClientStr = `From: "Jean Pierre Vegas" <me>\n` +
          `To: ${clientEmail}\n` +
          `Subject: Confirmación de Cita - Masaje\n\n` +
          `Hola ${clientName},\n\nTu cita ha sido confirmada para el ${new Date(startTime).toLocaleString('es-ES')}.\n\nSaludos,\nJean Pierre Vegas.`;
        
        const encodedClientMessage = Buffer.from(messageClientStr)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "-").replace(/\//g, "_")
          .replace(/=+$/, "");
          
        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encodedClientMessage }
        });

        // Send confirmation email to admin
        const messageAdminStr = `From: "Sistema de Reservas" <me>\n` +
          `To: ${adminEmail}\n` +
          `Subject: Nueva Reserva - ${clientName}\n\n` +
          `¡Tienes una nueva reserva!\n\n` +
          `Cliente: ${clientName}\n` +
          `Email: ${clientEmail}\n` +
          `Teléfono: ${clientPhone || 'No proporcionado'}\n` +
          `Fecha y hora: ${new Date(startTime).toLocaleString('es-ES')}\n\n` +
          `La reserva se ha añadido a tu Google Calendar.`;
        
        const encodedAdminMessage = Buffer.from(messageAdminStr)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "-").replace(/\//g, "_")
          .replace(/=+$/, "");
          
        await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encodedAdminMessage }
        });
      } catch (err) {
        console.error("Error creating calendar event or sending email:", err);
      }
    }

    appointments.push(newAppt);
    res.json(newAppt);
  });

  app.put("/api/appointments/:id", async (req, res) => {
    const { id } = req.params;
    const { startTime, endTime } = req.body;
    const appt = appointments.find(a => a.id === id);
    if (!appt) return res.status(404).json({ error: "No encontrado" });

    appt.startTime = startTime || appt.startTime;
    appt.endTime = endTime || appt.endTime;

    if (adminTokens && appt.eventId) {
      try {
        await calendar.events.patch({
          calendarId: "primary",
          eventId: appt.eventId,
          requestBody: {
            start: { dateTime: appt.startTime },
            end: { dateTime: appt.endTime }
          }
        });
        
        const messageStr = `From: "Jean Pierre Vegas" <me>\n` +
        `To: ${appt.clientEmail}\n` +
        `Subject: Actualización de Cita - Masaje\n\n` +
        `Tu cita ha sido modificada al ${new Date(appt.startTime).toLocaleString('es-ES')}.`;
      
        const encodedMessage = Buffer.from(messageStr).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedMessage } });

        // Admin notification
        const profile = await gmail.users.getProfile({ userId: "me" });
        const adminEmail = profile.data.emailAddress;
        
        const messageAdminStr = `From: "Sistema de Reservas" <me>\n` +
        `To: ${adminEmail}\n` +
        `Subject: Cita Reagendada - ${appt.clientName}\n\n` +
        `El cliente o el sistema ha reagendado una cita.\n\n` +
        `Cliente: ${appt.clientName}\n` +
        `Nueva Fecha y hora: ${new Date(appt.startTime).toLocaleString('es-ES')}\n`;
        
        const encodedAdminMessage = Buffer.from(messageAdminStr).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedAdminMessage } });

      } catch (e) {
        console.error("Error updating event", e);
      }
    }
    
    res.json(appt);
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    const apptIndex = appointments.findIndex(a => a.id === id);
    if (apptIndex === -1) return res.status(404).json({ error: "No encontrado" });

    const appt = appointments[apptIndex];
    appt.status = "cancelled";

    if (adminTokens && appt.eventId) {
      try {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: appt.eventId
        });
        
        let cancelMessage = `Tu cita para el ${new Date(appt.startTime).toLocaleString('es-ES')} ha sido cancelada.\n`;
        if (reason) {
          cancelMessage += `\nMotivo y mensaje de Jean Pierre:\n"${reason}"\n`;
        }
        cancelMessage += `\nSi deseas, puedes volver a agendar en cualquier momento desde la web.\n\nSaludos,\nJean Pierre Vegas.`;

         const messageStr = `From: "Jean Pierre Vegas" <me>\n` +
        `To: ${appt.clientEmail}\n` +
        `Subject: Cita Cancelada - Masaje\n\n` +
        cancelMessage;
      
        const encodedMessage = Buffer.from(messageStr).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedMessage } });

        // Admin notification
        const profile = await gmail.users.getProfile({ userId: "me" });
        const adminEmail = profile.data.emailAddress;
        
        const messageAdminStr = `From: "Sistema de Reservas" <me>\n` +
        `To: ${adminEmail}\n` +
        `Subject: Cita Cancelada - ${appt.clientName}\n\n` +
        `Se ha cancelado la siguiente cita.\n\n` +
        `Cliente: ${appt.clientName}\n` +
        `Email: ${appt.clientEmail}\n` +
        `Fecha original: ${new Date(appt.startTime).toLocaleString('es-ES')}\n` +
        (reason ? `\nMotivo: ${reason}` : "");
        
        const encodedAdminMessage = Buffer.from(messageAdminStr).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedAdminMessage } });

      } catch (e) {
        console.error("Error deleting event", e);
      }
    }

    appointments.splice(apptIndex, 1);
    res.json({ success: true });
  });

  // BOT API - Secure management endpoints
  app.post("/api/bot/verify", (req, res) => {
    const { email, verification } = req.body;
    if (!email || !verification) return res.status(400).json({ error: "Email y verificación requeridos" });
    
    const matched = appointments.filter(a => 
      a.clientEmail.toLowerCase() === email.trim().toLowerCase() && 
      (a.clientPhone.replace(/\s+/g, '') === verification.replace(/\s+/g, '') || 
       a.clientName.toLowerCase() === verification.trim().toLowerCase())
    );
    
    if (matched.length > 0) {
      res.json(matched);
    } else {
      res.status(404).json({ error: "No se encontraron citas con esos datos." });
    }
  });

  app.post("/api/bot/appointments/:id/reschedule", async (req, res) => {
    const { id } = req.params;
    const { newStartTime } = req.body;
    const appt = appointments.find(a => a.id === id);
    if (!appt) return res.status(404).json({ error: "Cita no encontrada" });

    const endT = new Date(new Date(newStartTime).getTime() + 60*60*1000).toISOString();
    
    if (adminTokens && appt.eventId) {
      try {
        await calendar.events.patch({
          calendarId: "primary",
          eventId: appt.eventId,
          requestBody: {
            start: { dateTime: newStartTime },
            end: { dateTime: endT }
          }
        });

        // Email Admins
        const profile = await gmail.users.getProfile({ userId: "me" });
        const adminEmail = profile.data.emailAddress;
        
        const notifyMsg = `From: "Sistema" <me>\nTo: ${adminEmail},${appt.clientEmail}\nSubject: Cita Reagendada - ${appt.clientName}\n\nLa cita de ${appt.clientName} ha sido reagendada al: ${new Date(newStartTime).toLocaleString('es-ES')}`;
        const encodedNotify = Buffer.from(notifyMsg).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedNotify } });
      } catch (e) {
        console.error("Error updating calendar:", e);
      }
    }

    appt.startTime = newStartTime;
    appt.endTime = endT;
    res.json(appt);
  });

  // AI Chat Route
  app.post("/api/chat", async (req, res) => {
     try {
       const { messages } = req.body;
       // System Prompt and Function definitions
       const chat = ai.chats.create({
         model: "gemini-3.1-flash-lite",
         config: {
           systemInstruction: "Eres el asistente virtual para reservas de masajes de Jean Pierre Vegas. Eres amable, profesional y directo. Puedes agendar citas, listar citas, reprogramar o cancelar si el usuario proporciona su email/nombre. Las citas duran por defecto 1 hora. La hora de trabajo es de 9:00 a 18:00.",
           tools: [{
             functionDeclarations: [
               {
                 name: "getAppointments",
                 description: "Obtiene la lista de todas las citas agendadas.",
                 parameters: { type: Type.OBJECT, properties: {} }
               },
               {
                 name: "bookAppointment",
                 description: "Agenda una nueva cita de masaje.",
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     clientName: { type: Type.STRING },
                     clientEmail: { type: Type.STRING },
                     clientPhone: { type: Type.STRING },
                     startTime: { type: Type.STRING, description: "Hora de inicio en ISO string" },
                   },
                   required: ["clientName", "clientEmail", "startTime"]
                 }
               },
               {
                 name: "cancelAppointment",
                 description: "Cancela una cita existente. Requiere confirmar email y encontrar la ID.",
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     appointmentId: { type: Type.STRING, description: "ID de la cita a cancelar" }
                   },
                   required: ["appointmentId"]
                 }
               },
               {
                 name: "updateAppointment",
                 description: "Reprograma una cita a una nueva hora.",
                 parameters: {
                   type: Type.OBJECT,
                   properties: {
                     appointmentId: { type: Type.STRING, description: "ID de la cita" },
                     newStartTime: { type: Type.STRING, description: "Nueva hora de inicio ISO" }
                   },
                   required: ["appointmentId", "newStartTime"]
                 }
               }
             ]
           }],
         }
       });

       const lastMsg = messages[messages.length - 1];
       const result = await chat.sendMessage({ message: lastMsg.content });
       
       let responseText = result.text || "";
       let newAppointments = null;

       if (result.functionCalls && result.functionCalls.length > 0) {
          const fnCall = result.functionCalls[0];
          
          if (fnCall.name === "getAppointments") {
             responseText = "Actualmente las citas son: " + JSON.stringify(appointments.map(a => ({ id: a.id, name: a.clientName, time: a.startTime })));
          } else if (fnCall.name === "bookAppointment") {
             const args = fnCall.args as any;
             const endTime = new Date(new Date(args.startTime).getTime() + 60*60*1000).toISOString();
             
             // Directly calling our internal api logic equivalent
             const newAppt: Appointment = {
                id: uuidv4(),
                clientName: args.clientName,
                clientEmail: args.clientEmail,
                clientPhone: args.clientPhone || "",
                startTime: args.startTime,
                endTime: endTime,
                status: "confirmed"
             };
             
            if (adminTokens) {
              try {
                const event = await calendar.events.insert({
                  calendarId: "primary",
                  requestBody: {
                    summary: `Masaje: ${newAppt.clientName}`,
                    start: { dateTime: newAppt.startTime },
                    end: { dateTime: newAppt.endTime }
                  }
                });
                newAppt.eventId = event.data.id!;
                const profile = await gmail.users.getProfile({ userId: "me" });
                const adminEmail = profile.data.emailAddress;

                const clientMsg = `From: "Jean Pierre Vegas" <me>\nTo: ${newAppt.clientEmail}\nSubject: Cita Confirmada\n\nCita confirmada ${new Date(newAppt.startTime).toLocaleString('es-ES')}`;
                const encodedClient = Buffer.from(clientMsg).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedClient } });

                const adminMsg = `From: "Sistema de Reservas" <me>\nTo: ${adminEmail}\nSubject: Nueva Reserva (Bot) - ${newAppt.clientName}\n\nEl bot ha agendado una nueva cita:\n\nCliente: ${newAppt.clientName}\nEmail: ${newAppt.clientEmail}\nFecha: ${new Date(newAppt.startTime).toLocaleString('es-ES')}`;
                const encodedAdmin = Buffer.from(adminMsg).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                await gmail.users.messages.send({ userId: "me", requestBody: { raw: encodedAdmin } });
              } catch(e) {}
            }
             appointments.push(newAppt);
             responseText = `¡Cita agendada para ${args.clientName} a las ${new Date(args.startTime).toLocaleString('es-ES')}!`;
             newAppointments = newAppt;
          } else if (fnCall.name === "cancelAppointment") {
             const args = fnCall.args as any;
             const apptIndex = appointments.findIndex(a => a.id === args.appointmentId);
             if (apptIndex !== -1) {
                const appt = appointments[apptIndex];
                if (adminTokens && appt.eventId) {
                  try {
                    await calendar.events.delete({ calendarId: "primary", eventId: appt.eventId });
                    const msg = Buffer.from(`To: ${appt.clientEmail}\nSubject: Cita Cancelada\n\nTu cita ha sido cancelada.`).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                    await gmail.users.messages.send({ userId: "me", requestBody: { raw: msg } });
                  } catch(e) {}
                }
                appointments.splice(apptIndex, 1);
                responseText = `La cita ha sido cancelada con éxito.`;
             } else {
                responseText = `No encontré la cita con ID ${args.appointmentId}.`;
             }
          } else if (fnCall.name === "updateAppointment") {
             const args = fnCall.args as any;
             const appt = appointments.find(a => a.id === args.appointmentId);
             if (appt) {
                appt.startTime = args.newStartTime;
                appt.endTime = new Date(new Date(args.newStartTime).getTime() + 60*60*1000).toISOString();
                if (adminTokens && appt.eventId) {
                  try {
                    await calendar.events.patch({ calendarId: "primary", eventId: appt.eventId, requestBody: { start: { dateTime: appt.startTime }, end: { dateTime: appt.endTime } }});
                    const msg = Buffer.from(`To: ${appt.clientEmail}\nSubject: Cita Modificada\n\nTu cita ha sido modificada a ${appt.startTime}.`).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                    await gmail.users.messages.send({ userId: "me", requestBody: { raw: msg } });
                  } catch(e) {}
                }
                responseText = `La cita ha sido reprogramada a ${new Date(args.newStartTime).toLocaleString('es-ES')} con éxito.`;
             } else {
                responseText = `No encontré la cita con ID ${args.appointmentId}.`;
             }
          }
       }
       
       res.json({ reply: responseText, functionCalled: result.functionCalls?.[0]?.name, newAppointments });
     } catch(e) {
        console.error(e);
        res.status(500).json({error: "Error AI"});
     }
  });


  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
