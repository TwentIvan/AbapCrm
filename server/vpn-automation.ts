import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export interface VPNConnection {
  id: string;
  name: string;
  type: 'forticlient' | 'native' | 'openfortivpn';
  server?: string;
  port?: number;
  status: 'available' | 'configured' | 'error';
  automationScript?: string;
  description?: string;
}

export interface VPNAutomationResult {
  success: boolean;
  connectionType: string;
  scriptPath?: string;
  executionCommand?: string;
  instructions?: string;
  error?: string;
}

/**
 * Discover available VPN connections on macOS
 */
export async function discoverVPNConnections(): Promise<VPNConnection[]> {
  const connections: VPNConnection[] = [];

  try {
    // Detect if we're running on macOS
    const isMacOS = process.platform === 'darwin';
    
    if (isMacOS) {
      // 1. Check for FortiClient configurations
      const fortiConnections = await discoverFortiClientConnections();
      connections.push(...fortiConnections);

      // 2. Check for native macOS VPN connections
      const nativeConnections = await discoverNativeVPNConnections();
      connections.push(...nativeConnections);

      // 3. Check if openfortivpn is available
      const openfortiConnection = await checkOpenFortiVPNAvailability();
      if (openfortiConnection) {
        connections.push(openfortiConnection);
      }
    } else {
      // Demo data for non-macOS environments (like Replit)
      console.log('Non-macOS environment detected, showing demo VPN connections');
      connections.push(...getDemoVPNConnections());
    }

  } catch (error) {
    console.error('Error discovering VPN connections:', error);
  }

  return connections;
}

/**
 * Demo VPN connections for testing on non-macOS systems
 */
function getDemoVPNConnections(): VPNConnection[] {
  return [
    {
      id: 'forticlient-demo-1',
      name: 'Cliente A - VPN Aziendale',
      type: 'forticlient',
      server: 'vpn.clientea.com',
      port: 443,
      status: 'configured',
      description: 'FortiClient SSL VPN per Cliente A',
      automationScript: 'applescript'
    },
    {
      id: 'forticlient-demo-2', 
      name: 'Cliente B - Accesso Remoto',
      type: 'forticlient',
      server: 'remote.clienteb.com',
      port: 10443,
      status: 'configured',
      description: 'FortiClient SSL VPN per Cliente B',
      automationScript: 'applescript'
    },
    {
      id: 'forticlient-demo-3',
      name: 'Progetto SAP Cloud',
      type: 'forticlient', 
      server: 'sap-cloud.example.com',
      port: 443,
      status: 'configured',
      description: 'FortiClient VPN per ambiente SAP Cloud',
      automationScript: 'applescript'
    },
    {
      id: 'native-demo-1',
      name: 'VPN Ufficio Principale',
      type: 'native',
      status: 'configured',
      description: 'VPN nativa macOS per ufficio principale',
      automationScript: 'scutil'
    },
    {
      id: 'native-demo-2',
      name: 'Backup VPN Connection',
      type: 'native', 
      status: 'configured',
      description: 'Connessione VPN di backup via L2TP',
      automationScript: 'scutil'
    },
    {
      id: 'openfortivpn-demo',
      name: 'OpenFortiVPN (Alternative)',
      type: 'openfortivpn',
      status: 'available',
      description: 'Client VPN open source con supporto CLI completo'
    }
  ];
}

/**
 * Discover FortiClient VPN configurations
 */
async function discoverFortiClientConnections(): Promise<VPNConnection[]> {
  const connections: VPNConnection[] = [];

  try {
    const fortiClientPath = "/Library/Application Support/Fortinet/FortiClient/bin";
    const fconfigPath = path.join(fortiClientPath, "fcconfig");
    const legacyFconfigPath = path.join(fortiClientPath, "FCConfig");

    // Check if FortiClient tools exist
    let configTool: string | null = null;
    try {
      await fs.access(fconfigPath);
      configTool = fconfigPath;
    } catch {
      try {
        await fs.access(legacyFconfigPath);
        configTool = legacyFconfigPath;
      } catch {
        console.log('FortiClient configuration tools not found');
        return connections;
      }
    }

    if (configTool) {
      // Export FortiClient configurations
      const tempConfigFile = "/tmp/forticlient_config_export.xml";
      try {
        const exportCommand = `cd "${fortiClientPath}" && sudo "${configTool}" -f "${tempConfigFile}" -m all -o export`;
        console.log('Attempting to export FortiClient config with:', exportCommand);
        
        // Note: This requires sudo privileges, in production you might want to handle this differently
        const { stdout, stderr } = await execAsync(exportCommand);
        
        if (stderr) {
          console.log('FortiClient export stderr:', stderr);
        }

        // Parse the exported XML to extract VPN connection names
        const configConnections = await parseFortiClientConfig(tempConfigFile);
        connections.push(...configConnections);

        // Clean up temp file
        try {
          await fs.unlink(tempConfigFile);
        } catch {
          // Ignore cleanup errors
        }
      } catch (error) {
        console.log('FortiClient config export failed (might need sudo):', error);
        
        // Fallback: Add a generic FortiClient connection indicator
        connections.push({
          id: 'forticlient-generic',
          name: 'FortiClient (GUI Control)',
          type: 'forticlient',
          status: 'available',
          description: 'FortiClient detected - will use GUI automation',
          automationScript: 'applescript'
        });
      }
    }
  } catch (error) {
    console.error('Error checking FortiClient:', error);
  }

  return connections;
}

/**
 * Parse FortiClient XML configuration to extract VPN connections
 */
async function parseFortiClientConfig(configPath: string): Promise<VPNConnection[]> {
  const connections: VPNConnection[] = [];

  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    
    // Simple XML parsing to find VPN connection entries
    // In production, you might want to use a proper XML parser
    const vpnMatches = configContent.match(/<vpn_connection[^>]*name="([^"]*)"[^>]*>/g);
    
    if (vpnMatches) {
      vpnMatches.forEach((match, index) => {
        const nameMatch = match.match(/name="([^"]*)"/);
        if (nameMatch && nameMatch[1]) {
          connections.push({
            id: `forticlient-${index}`,
            name: nameMatch[1],
            type: 'forticlient',
            status: 'configured',
            description: `FortiClient VPN: ${nameMatch[1]}`,
            automationScript: 'applescript'
          });
        }
      });
    }
  } catch (error) {
    console.error('Error parsing FortiClient config:', error);
  }

  return connections;
}

/**
 * Discover native macOS VPN connections
 */
async function discoverNativeVPNConnections(): Promise<VPNConnection[]> {
  const connections: VPNConnection[] = [];

  try {
    const { stdout } = await execAsync('scutil --nc list');
    
    // Parse scutil output to find VPN services
    const lines = stdout.split('\n');
    lines.forEach((line, index) => {
      const match = line.match(/\* \(Connected\)\s+"([^"]*)"|\* \(Disconnected\)\s+"([^"]*)"/);
      if (match) {
        const serviceName = match[1] || match[2];
        if (serviceName && serviceName.toLowerCase().includes('vpn')) {
          connections.push({
            id: `native-${index}`,
            name: serviceName,
            type: 'native',
            status: 'configured',
            description: `Native macOS VPN: ${serviceName}`,
            automationScript: 'scutil'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error checking native VPN connections:', error);
  }

  return connections;
}

/**
 * Check if openfortivpn is available as an alternative
 */
async function checkOpenFortiVPNAvailability(): Promise<VPNConnection | null> {
  try {
    const { stdout } = await execAsync('which openfortivpn');
    if (stdout.trim()) {
      return {
        id: 'openfortivpn',
        name: 'OpenFortiVPN (Alternative)',
        type: 'openfortivpn',
        status: 'available',
        description: 'Open-source FortiVPN client with CLI support'
      };
    }
  } catch (error) {
    // openfortivpn not installed
  }

  return null;
}

/**
 * Generate automation script for VPN connection
 */
export async function generateVPNAutomationScript(connectionInfo: any): Promise<VPNAutomationResult> {
  const { vpnConnection } = connectionInfo;

  if (!vpnConnection) {
    return {
      success: false,
      connectionType: 'none',
      error: 'No VPN connection configured'
    };
  }

  try {
    switch (vpnConnection.type) {
      case 'forticlient':
        return await generateFortiClientScript(vpnConnection);
      
      case 'native':
        return await generateNativeVPNScript(vpnConnection);
      
      case 'openfortivpn':
        return await generateOpenFortiVPNScript(vpnConnection);
      
      default:
        return {
          success: false,
          connectionType: vpnConnection.type || 'unknown',
          error: 'Unsupported VPN connection type'
        };
    }
  } catch (error) {
    return {
      success: false,
      connectionType: vpnConnection.type || 'unknown',
      error: `Failed to generate automation script: ${error}`
    };
  }
}

/**
 * Generate AppleScript for FortiClient GUI automation
 */
async function generateFortiClientScript(vpnConnection: any): Promise<VPNAutomationResult> {
  const applescript = `
tell application "FortiClient"
    activate
    delay 2
    
    -- Attempt to connect to VPN
    try
        -- This is a simplified approach - actual implementation may vary
        -- based on FortiClient GUI structure
        tell application "System Events"
            tell process "FortiClient"
                -- Click on VPN tab or connection
                -- Note: This requires GUI inspection to get exact element paths
                click button "Connect" of window 1
            end tell
        end tell
        
        return "VPN connection initiated for ${vpnConnection.name}"
    on error errMsg
        return "Error connecting to VPN: " & errMsg
    end try
end tell`;

  return {
    success: true,
    connectionType: 'forticlient',
    executionCommand: `osascript -e '${applescript.replace(/'/g, "'\"'\"'")}'`,
    instructions: `AppleScript generated for FortiClient VPN: ${vpnConnection.name}
    
To execute manually:
1. Save the script as a .scpt file
2. Run: osascript path/to/script.scpt
3. Ensure FortiClient has accessibility permissions

Note: This script may need customization based on your specific FortiClient setup.`,
    scriptPath: '/tmp/forticlient_automation.scpt'
  };
}

/**
 * Generate script for native macOS VPN
 */
async function generateNativeVPNScript(vpnConnection: any): Promise<VPNAutomationResult> {
  const command = `scutil --nc start "${vpnConnection.name}"`;
  
  return {
    success: true,
    connectionType: 'native',
    executionCommand: command,
    instructions: `Native macOS VPN connection script for: ${vpnConnection.name}
    
To execute:
${command}

To disconnect:
scutil --nc stop "${vpnConnection.name}"

To check status:
scutil --nc status "${vpnConnection.name}"`
  };
}

/**
 * Generate script for openfortivpn
 */
async function generateOpenFortiVPNScript(vpnConnection: any): Promise<VPNAutomationResult> {
  const configTemplate = `# OpenFortiVPN Configuration
# Save this as a .conf file and run: sudo openfortivpn -c /path/to/config.conf

host = ${vpnConnection.server || 'vpn.example.com'}
port = ${vpnConnection.port || 443}
username = your_username
# password = your_password  # Or use --password flag
# realm = your_realm  # If required
# user-cert = /path/to/certificate  # If required
# user-key = /path/to/private-key   # If required
`;

  return {
    success: true,
    connectionType: 'openfortivpn',
    executionCommand: 'sudo openfortivpn -c /path/to/config.conf',
    instructions: `OpenFortiVPN configuration generated
    
1. Install openfortivpn: brew install openfortivpn
2. Create config file with the provided template
3. Run: sudo openfortivpn -c /path/to/config.conf
4. Or run interactively: sudo openfortivpn vpn.server.com:443 -u username

Config template:
${configTemplate}`,
    scriptPath: '/tmp/openfortivpn_config.conf'
  };
}