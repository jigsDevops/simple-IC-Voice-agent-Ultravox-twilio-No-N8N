import express from 'express';
import https from 'https';
import twilio from 'twilio';
import 'dotenv/config';

const app = express();
const port = 3000;

// Add middleware to parse Incoming POST data
app.use(express.urlencoded({ extended: true }));

// Configuration
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY;
if (!ULTRAVOX_API_KEY) {
  console.error("Error: ULTRAVOX_API_KEY environment variable not set.");
  process.exit(1); // Exit if the API key is missing
}
const ULTRAVOX_API_URL = "https://api.ultravox.ai/api/calls";

// Ultravox configuration (Base)
const BASE_SYSTEM_PROMPT = `YOUR NAME IS LISA and you are answering calls on behalf of Omegga AI Agency, a Canada-based company specializing in AI Automation and web development services.

Greet the caller warmly and introduce yourself as a representative of Omegga AI Agency. Ask how you can assist them today.

If they inquire about services, explain that Omegga specializes in:
- AI Automation solutions (including Voice AI)
- Web development services
- Multimodal use cases
- Customized Business Automation solutions

If asked about Pricing, explain that Omegga AI Agency operates both as a Pure AI Automation Agency and a Web Development Agency. After understanding their requirements, you will pass that information to the relevant team, and a team member will contact them within 24 hours.

Focus on:
- Understanding their Business needs
- Gathering specific requirements
- Being Professional and helpful
- Explaining Omegga AI Agency's expertise in delivering effective Business Solutions

Remember to collect their contact details for follow-up if they show interest.`;

const ULTRAVOX_CALL_CONFIG_BASE = {
  model: 'fixie-ai/ultravox',
  voice: 'Mark', // Consider choosing a female voice if the agent name is Lisa
  temperature: 0.3,
  firstSpeaker: 'FIRST_SPEAKER_AGENT',
  medium: { "twilio": {} }
};

// Create Ultravox call and get Join URL
async function createUltravoxCall(config) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': ULTRAVOX_API_KEY
    }
  };

  return new Promise((resolve, reject) => {
    const request = https.request(ULTRAVOX_API_URL, options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            console.error(`Ultravox API Error: ${response.statusCode}`, data);
            reject(new Error(`Ultravox API request failed with status ${response.statusCode}`));
          }
        } catch (parseError) {
          console.error("Error parsing Ultravox response:", parseError);
          reject(parseError);
        }
      });
    });

    request.on('error', (error) => {
      console.error("Error making Ultravox request:", error);
      reject(error);
    });

    request.write(JSON.stringify(config));
    request.end();
  });
}

// Handle incoming calls
app.post('/incoming', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse(); // Correct namespace

  try {
    // Get Caller's Phone number
    const callerNumber = req.body.From;
    if (!callerNumber) {
      console.warn('Incoming call without a "From" number.');
      twiml.say('Sorry, we could not identify your number. Please try again.');
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }
    console.log(`Incoming call from: ${callerNumber}`);

    // Create dynamic system prompt with caller's number
    const dynamicSystemPrompt = `${BASE_SYSTEM_PROMPT}

IMPORTANT CONTEXT:
- The caller's phone number is: ${callerNumber}
- You already have this number. If they request a callback or follow-up, you can say, "I have your number as ${callerNumber}, is this the best number to reach you for a follow-up?" Get confirmation before using it. Do not just assume it's their number for follow-up.

Remember you already have their contact number (${callerNumber}), so you can just focus on getting other information if they show interest.`;

    // Create the final Ultravox call config
    const callConfig = {
      ...ULTRAVOX_CALL_CONFIG_BASE,
      systemPrompt: dynamicSystemPrompt
    };

    // Create Ultravox call with updated config
    console.log("Creating Ultravox call with config:", JSON.stringify(callConfig, null, 2)); // Log config for debugging
    const { joinUrl } = await createUltravoxCall(callConfig);
    console.log(`Received Ultravox joinUrl: ${joinUrl}`);

    // Connect the call to the Ultravox stream
    const connect = twiml.connect();
    connect.stream({
      url: joinUrl, // This should be a WebSocket URL (wss://) provided by Ultravox
      name: 'Ultravox Stream' // Descriptive name
    });

    // Send the TwiML response
    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error('Error handling incoming call:', error);
    // Use the same twiml instance declared at the beginning of the try block
    twiml.say('Sorry, there was an error connecting your call. Please try again later.');
    res.type('text/xml');
    res.status(500).send(twiml.toString()); // Send 500 status on error
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`); // Corrected template literal
});
