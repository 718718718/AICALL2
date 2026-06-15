import { io, Socket } from "socket.io-client";

/** Socket.io expects http(s); normalize ws(s) scheme from NEXT_PUBLIC_WS_URL. */
function resolveWsUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_WS_URL ||
    (process.env.NODE_ENV === 'production'
      ? process.env.NEXT_PUBLIC_WS_URL_PROD
      : process.env.NEXT_PUBLIC_WS_URL_DEV) ||
    'ws://localhost:5000';
  return raw.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
}

export interface TranscriptEntry {
  speaker: "AI" | "Customer" | "System";
  text: string;
  timestamp: string;
}

export interface WebSocketManager {
  connect(): Socket | null;
  disconnect(): void;
  getSocket(): Socket | null;
  isConnected(): boolean;
}

class WebSocketConnectionManager implements WebSocketManager {
  private static instance: WebSocketConnectionManager;
  private socket: Socket | null = null;
  private backendUrl: string;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  private constructor() {
    this.backendUrl = resolveWsUrl();
  }

  public static getInstance(): WebSocketConnectionManager {
    if (!WebSocketConnectionManager.instance) {
      WebSocketConnectionManager.instance = new WebSocketConnectionManager();
    }
    return WebSocketConnectionManager.instance;
  }

  public connect(): Socket | null {
    // If already connected or connecting, return existing socket
    if (this.socket?.connected || this.isConnecting) {
      console.log("[WebSocketManager] Using existing connection");
      return this.socket;
    }

    console.log("[WebSocketManager] Creating new connection to:", this.backendUrl);
    this.isConnecting = true;

    try {
      const token = localStorage.getItem('accessToken');
      
      this.socket = io(this.backendUrl, {
        transports: ["websocket"],
        forceNew: false, // Use existing connection if available
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: this.maxReconnectAttempts,
        auth: {
          token: token || undefined
        }
      });

      this.setupEventListeners();
      return this.socket;
    } catch (error) {
      console.error("[WebSocketManager] Connection failed:", error);
      this.isConnecting = false;
      return null;
    }
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("[WebSocketManager] Connected successfully");
      console.log("[WebSocketManager] Socket ID:", this.socket?.id);
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    });

    this.socket.on("connect_error", (error) => {
      console.error("[WebSocketManager] Connection error:", error.message);
      this.isConnecting = false;
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error("[WebSocketManager] Max reconnection attempts reached");
        this.disconnect();
      }
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[WebSocketManager] Disconnected:", reason);
      this.isConnecting = false;
      
      // Don't auto-reconnect for intentional disconnections
      if (reason === "io client disconnect") {
        return;
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      console.log(`[WebSocketManager] Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
    });

    this.socket.on("reconnect_error", (error) => {
      console.error("[WebSocketManager] Reconnection error:", error);
    });
  }

  public disconnect(): void {
    if (this.socket) {
      console.log("[WebSocketManager] Disconnecting socket");
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  public getSocket(): Socket | null {
    return this.socket?.connected ? this.socket : null;
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  // Join a call room
  public joinCallRoom(phoneNumber: string, connectionId: string): void {
    const socket = this.getSocket();
    if (socket) {
      console.log("[WebSocketManager] Joining call room:", phoneNumber);
      socket.emit("join-call", { phoneNumber, connectionId });
    }
  }

  // Leave a call room  
  public leaveCallRoom(phoneNumber: string, connectionId: string): void {
    const socket = this.getSocket();
    if (socket) {
      console.log("[WebSocketManager] Leaving call room:", phoneNumber);
      socket.emit("leave-call", { phoneNumber, connectionId });
    }
  }

  // Subscribe to transcript updates for a specific phone number
  public subscribeToTranscripts(
    phoneNumber: string, 
    connectionId: string,
    callback: (data: any) => void
  ): () => void {
    const socket = this.getSocket();
    if (!socket) {
      console.error("[WebSocketManager] No socket connection available");
      return () => {};
    }

    console.log("[WebSocketManager] Subscribing to transcripts for:", phoneNumber);
    
    // Join the call room
    this.joinCallRoom(phoneNumber, connectionId);

    // Set up event listener
    const handleTranscriptUpdate = (data: any) => {
      console.log("[WebSocketManager] Transcript update received:", data);
      callback(data);
    };

    socket.on("transcript-update", handleTranscriptUpdate);

    // Return cleanup function
    return () => {
      console.log("[WebSocketManager] Unsubscribing from transcripts for:", phoneNumber);
      socket.off("transcript-update", handleTranscriptUpdate);
      this.leaveCallRoom(phoneNumber, connectionId);
    };
  }

  // Subscribe to call status updates
  public subscribeToCallStatus(callback: (data: any) => void): () => void {
    const socket = this.getSocket();
    if (!socket) {
      console.error("[WebSocketManager] No socket connection available");
      return () => {};
    }

    console.log("[WebSocketManager] Subscribing to call status updates");
    
    const handleCallStatus = (data: any) => {
      console.log("[WebSocketManager] Call status update received:", data);
      callback(data);
    };

    socket.on("call-status", handleCallStatus);

    // Return cleanup function
    return () => {
      console.log("[WebSocketManager] Unsubscribing from call status updates");
      socket.off("call-status", handleCallStatus);
    };
  }

  // Subscribe to call termination events
  public subscribeToCallTermination(callback: (data: any) => void): () => void {
    const socket = this.getSocket();
    if (!socket) {
      console.error("[WebSocketManager] No socket connection available");
      return () => {};
    }

    console.log("[WebSocketManager] Subscribing to call termination events");
    
    const handleCallTermination = (data: any) => {
      console.log("[WebSocketManager] Call termination received:", data);
      console.log(`[WebSocketManager] Call ${data.callId} terminated with status: ${data.status}`);
      console.log(`[WebSocketManager] End reason: ${data.endReason}, Result: ${data.callResult}`);
      callback(data);
    };

    socket.on("call-terminated", handleCallTermination);

    // Return cleanup function
    return () => {
      console.log("[WebSocketManager] Unsubscribing from call termination events");
      socket.off("call-terminated", handleCallTermination);
    };
  }

  // Get existing call data
  public getExistingCallData(phoneNumber: string): void {
    const socket = this.getSocket();
    if (socket) {
      console.log("[WebSocketManager] Requesting existing call data for:", phoneNumber);
      socket.emit("get-existing-call-data", { phoneNumber });
    }
  }

  // Get call status
  public getCallStatus(phoneNumber: string): void {
    const socket = this.getSocket();
    if (socket) {
      console.log("[WebSocketManager] Requesting call status for:", phoneNumber);
      socket.emit("get-call-status", { phoneNumber });
    }
  }
}

// Export singleton instance
export const websocketManager = WebSocketConnectionManager.getInstance();

// Export the class for testing
export { WebSocketConnectionManager };