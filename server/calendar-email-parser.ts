/**
 * Calendar/Meeting Email Parser
 * Riconosce e estrae informazioni da inviti a riunioni (O365, Google Calendar, etc.)
 */

export interface CalendarEventMetadata {
  eventTitle: string;
  eventDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  eventDateTime?: string; // Full datetime string
  eventLocation?: string;
  eventOrganizer?: string;
  eventOrganizerEmail?: string;
  eventAttendees?: string[];
  eventDescription?: string;
  
  // Teams specific
  teamsLink?: string;
  teamsMeetingId?: string;
  teamsPasscode?: string;
  teamsDialIn?: string;
  teamsConferenceId?: string;
  
  // Google Meet specific
  googleMeetLink?: string;
  
  // Zoom specific
  zoomLink?: string;
  zoomMeetingId?: string;
  zoomPasscode?: string;
  
  // Generic
  meetingLink?: string;
  calendarType: 'teams' | 'google' | 'zoom' | 'outlook' | 'generic';
  eventType: 'meeting' | 'appointment' | 'reminder' | 'unknown';
}

export interface CalendarParseResult {
  isCalendarEmail: boolean;
  metadata?: CalendarEventMetadata;
  confidence: number;
  sourceType?: 'email_calendar_event';
}

// Pattern per riconoscere email di inviti Teams
const TEAMS_PATTERNS = {
  meetingLink: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<"]+/gi,
  meetingId: /ID\s*riunione[:\s]*([0-9\s]+)/i,
  passcode: /Passcode[:\s]*([^\s<]+)/i,
  dialIn: /tel:\+([0-9,#]+)/i,
  conferenceId: /ID\s*conferenza[^\d]*([0-9\s#]+)/i,
  joinMeeting: /Partecipa\s*alla\s*riunione/i,
  microsoftTeams: /Microsoft\s*Teams/i,
};

// Pattern per riconoscere email di inviti Google Calendar/Meet
const GOOGLE_PATTERNS = {
  meetLink: /https:\/\/meet\.google\.com\/[a-z-]+/gi,
  calendarEvent: /calendar-notification@google\.com/i,
  eventInvite: /Google\s*Calendar/i,
};

// Pattern per riconoscere email di inviti Zoom
const ZOOM_PATTERNS = {
  meetingLink: /https:\/\/[^\/]*zoom\.us\/j\/[0-9]+/gi,
  meetingId: /Meeting\s*ID[:\s]*([0-9\s]+)/i,
  passcode: /Passcode[:\s]*([^\s<]+)/i,
};

// Pattern per estrarre data/ora da email inoltrate
const DATETIME_PATTERNS = {
  // "Quando: mercoledì 3 dicembre 2025 10:30-12:30"
  quandoPattern: /Quando[:\s]*([^\n<]+)/i,
  // "When: Wednesday, December 3, 2025 10:30 AM - 12:30 PM"
  whenPattern: /When[:\s]*([^\n<]+)/i,
  // "Dove: Riunione Microsoft Teams"
  dovePattern: /Dove[:\s]*([^\n<]+)/i,
  // "Where: Microsoft Teams Meeting"
  wherePattern: /Where[:\s]*([^\n<]+)/i,
  // "Da: Michela Princivalle"
  daPattern: /Da[:\s]*([^<\n]+)/i,
  // "From: Michela Princivalle"
  fromPattern: /From[:\s]*([^<\n]+)/i,
  // "A: Ivan Lo Torto; Angelamaria Capece"
  aPattern: /A[:\s]*([^<\n]+)/i,
  // "To: Ivan Lo Torto; Angelamaria Capece"
  toPattern: /To[:\s]*([^<\n]+)/i,
};

// Sender patterns for calendar notifications
const CALENDAR_SENDER_PATTERNS = [
  /calendar-notification@google\.com/i,
  /noreply@calendar\.google\.com/i,
  /outlook\.com/i,
  /@microsoft\.com/i,
  /teams@microsoft\.com/i,
  /calendar@/i,
  /invite@/i,
  /meeting@/i,
];

// Subject patterns for calendar events
const CALENDAR_SUBJECT_PATTERNS = [
  /invito[:\s]/i,
  /invitation[:\s]/i,
  /meeting[:\s]/i,
  /riunione[:\s]/i,
  /appuntamento[:\s]/i,
  /appointment[:\s]/i,
  /reminder[:\s]/i,
  /promemoria[:\s]/i,
  /call[:\s]/i,
  /evento[:\s]/i,
  /event[:\s]/i,
];

export class CalendarEmailParser {
  /**
   * Analizza un'email per determinare se è un invito a un evento
   */
  static parse(
    subject: string,
    body: string,
    htmlBody: string,
    fromEmail: string
  ): CalendarParseResult {
    let confidence = 0;
    let calendarType: CalendarEventMetadata['calendarType'] = 'generic';
    
    const contentToSearch = `${subject} ${body} ${htmlBody}`.toLowerCase();
    
    // Check for Teams meeting
    const teamsLinkMatch = htmlBody.match(TEAMS_PATTERNS.meetingLink);
    const hasTeamsIndicators = TEAMS_PATTERNS.microsoftTeams.test(contentToSearch) ||
                               TEAMS_PATTERNS.joinMeeting.test(contentToSearch);
    
    if (teamsLinkMatch || hasTeamsIndicators) {
      confidence += 0.5;
      calendarType = 'teams';
    }
    
    // Check for Google Meet
    const googleMeetMatch = htmlBody.match(GOOGLE_PATTERNS.meetLink);
    if (googleMeetMatch) {
      confidence += 0.4;
      calendarType = 'google';
    }
    
    // Check for Zoom
    const zoomLinkMatch = htmlBody.match(ZOOM_PATTERNS.meetingLink);
    if (zoomLinkMatch) {
      confidence += 0.4;
      calendarType = 'zoom';
    }
    
    // Check sender patterns
    for (const pattern of CALENDAR_SENDER_PATTERNS) {
      if (pattern.test(fromEmail)) {
        confidence += 0.2;
        break;
      }
    }
    
    // Check subject patterns
    for (const pattern of CALENDAR_SUBJECT_PATTERNS) {
      if (pattern.test(subject)) {
        confidence += 0.1;
        break;
      }
    }
    
    // Check for datetime patterns (Quando/When, Dove/Where)
    const hasQuando = DATETIME_PATTERNS.quandoPattern.test(htmlBody) || 
                      DATETIME_PATTERNS.whenPattern.test(htmlBody);
    const hasDove = DATETIME_PATTERNS.dovePattern.test(htmlBody) || 
                    DATETIME_PATTERNS.wherePattern.test(htmlBody);
    
    if (hasQuando) confidence += 0.2;
    if (hasDove) confidence += 0.1;
    
    // If confidence is too low, not a calendar email
    if (confidence < 0.3) {
      return {
        isCalendarEmail: false,
        confidence: 0,
      };
    }
    
    // Extract metadata
    const metadata = this.extractMetadata(subject, body, htmlBody, calendarType);
    
    return {
      isCalendarEmail: true,
      metadata,
      confidence: Math.min(confidence, 1),
      sourceType: 'email_calendar_event',
    };
  }
  
  /**
   * Estrae i metadati dell'evento dall'email
   */
  private static extractMetadata(
    subject: string,
    body: string,
    htmlBody: string,
    calendarType: CalendarEventMetadata['calendarType']
  ): CalendarEventMetadata {
    const metadata: CalendarEventMetadata = {
      eventTitle: this.cleanSubject(subject),
      calendarType,
      eventType: 'meeting',
    };
    
    // Extract datetime
    const quandoMatch = htmlBody.match(DATETIME_PATTERNS.quandoPattern) ||
                        htmlBody.match(DATETIME_PATTERNS.whenPattern);
    if (quandoMatch) {
      metadata.eventDateTime = this.cleanHtmlText(quandoMatch[1]);
      this.parseDateTimeString(metadata.eventDateTime, metadata);
    }
    
    // Extract location
    const doveMatch = htmlBody.match(DATETIME_PATTERNS.dovePattern) ||
                      htmlBody.match(DATETIME_PATTERNS.wherePattern);
    if (doveMatch) {
      metadata.eventLocation = this.cleanHtmlText(doveMatch[1]);
    }
    
    // Extract organizer
    const daMatch = htmlBody.match(DATETIME_PATTERNS.daPattern) ||
                    htmlBody.match(DATETIME_PATTERNS.fromPattern);
    if (daMatch) {
      const organizer = this.cleanHtmlText(daMatch[1]);
      // Try to extract email from format "Name <email>"
      const emailMatch = organizer.match(/<([^>]+)>/);
      if (emailMatch) {
        metadata.eventOrganizerEmail = emailMatch[1];
        metadata.eventOrganizer = organizer.replace(/<[^>]+>/, '').trim();
      } else {
        metadata.eventOrganizer = organizer;
      }
    }
    
    // Extract attendees
    const aMatch = htmlBody.match(DATETIME_PATTERNS.aPattern) ||
                   htmlBody.match(DATETIME_PATTERNS.toPattern);
    if (aMatch) {
      const attendeesStr = this.cleanHtmlText(aMatch[1]);
      metadata.eventAttendees = attendeesStr
        .split(/[;,]/)
        .map(a => a.trim())
        .filter(a => a.length > 0);
    }
    
    // Extract Teams-specific info
    if (calendarType === 'teams') {
      const teamsLink = htmlBody.match(TEAMS_PATTERNS.meetingLink);
      if (teamsLink) {
        metadata.teamsLink = teamsLink[0];
        metadata.meetingLink = teamsLink[0];
      }
      
      const meetingId = htmlBody.match(TEAMS_PATTERNS.meetingId);
      if (meetingId) {
        metadata.teamsMeetingId = meetingId[1].replace(/\s/g, '');
      }
      
      const passcode = htmlBody.match(TEAMS_PATTERNS.passcode);
      if (passcode) {
        metadata.teamsPasscode = passcode[1];
      }
      
      const dialIn = htmlBody.match(TEAMS_PATTERNS.dialIn);
      if (dialIn) {
        metadata.teamsDialIn = '+' + dialIn[1].replace(/,/g, ' ');
      }
      
      const confId = htmlBody.match(TEAMS_PATTERNS.conferenceId);
      if (confId) {
        metadata.teamsConferenceId = confId[1].trim();
      }
    }
    
    // Extract Google Meet-specific info
    if (calendarType === 'google') {
      const meetLink = htmlBody.match(GOOGLE_PATTERNS.meetLink);
      if (meetLink) {
        metadata.googleMeetLink = meetLink[0];
        metadata.meetingLink = meetLink[0];
      }
    }
    
    // Extract Zoom-specific info
    if (calendarType === 'zoom') {
      const zoomLink = htmlBody.match(ZOOM_PATTERNS.meetingLink);
      if (zoomLink) {
        metadata.zoomLink = zoomLink[0];
        metadata.meetingLink = zoomLink[0];
      }
      
      const meetingId = htmlBody.match(ZOOM_PATTERNS.meetingId);
      if (meetingId) {
        metadata.zoomMeetingId = meetingId[1].replace(/\s/g, '');
      }
      
      const passcode = htmlBody.match(ZOOM_PATTERNS.passcode);
      if (passcode) {
        metadata.zoomPasscode = passcode[1];
      }
    }
    
    return metadata;
  }
  
  /**
   * Pulisce il subject rimuovendo prefissi comuni
   */
  private static cleanSubject(subject: string): string {
    return subject
      .replace(/^(Re:|Fwd:|I:|FW:)\s*/gi, '')
      .replace(/^(Invito:|Invitation:|Reminder:)\s*/gi, '')
      .trim();
  }
  
  /**
   * Pulisce il testo HTML
   */
  private static cleanHtmlText(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Parsa una stringa data/ora in componenti separati
   */
  private static parseDateTimeString(
    dateTimeStr: string,
    metadata: CalendarEventMetadata
  ): void {
    // Pattern: "mercoledì 3 dicembre 2025 10:30-12:30"
    const italianPattern = /(\w+)\s+(\d+)\s+(\w+)\s+(\d{4})\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i;
    const match = dateTimeStr.match(italianPattern);
    
    if (match) {
      const [, dayOfWeek, day, month, year, startTime, endTime] = match;
      metadata.eventDate = `${day} ${month} ${year}`;
      metadata.eventStartTime = startTime;
      metadata.eventEndTime = endTime;
    }
    
    // Pattern English: "Wednesday, December 3, 2025 10:30 AM - 12:30 PM"
    const englishPattern = /(\w+),?\s+(\w+)\s+(\d+),?\s+(\d{4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i;
    const matchEn = dateTimeStr.match(englishPattern);
    
    if (matchEn) {
      const [, dayOfWeek, month, day, year, startTime, endTime] = matchEn;
      metadata.eventDate = `${month} ${day}, ${year}`;
      metadata.eventStartTime = startTime.trim();
      metadata.eventEndTime = endTime.trim();
    }
  }
}
