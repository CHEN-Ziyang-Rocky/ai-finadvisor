import React, { useState } from 'react';
import chatIcon from '../../assets/images/chat-icon.png';
import { sendMessage, fetchUserPortraits_chat  } from '../../api';
import './Chat.css';
import SettingsPopup from '../../assets/modal/SettingsPopup';

const Chat = () => {
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [userPortraits, setUserPortraits] = useState(null);

  const [temperature, setTemperature] = useState(0.5);
  const [topP, setTopP] = useState(0.9);
  const [frequencyPenalty, setFrequencyPenalty] = useState(0.2);
  const [presencePenalty, setPresencePenalty] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const toggleSettings = () => setSettingsVisible(!settingsVisible);
  
  
  const toggleChat = () => {
    setChatVisible(!chatVisible);
  };

  const handleSend = async () => {
    if (input.trim() === '') return;

    const prompt = userPortraits
      ? `${input}\n\nUser Portraits: ${JSON.stringify(userPortraits, null, 2)}`
      : input;

    const newMessage = { sender: 'user', text: input };
    setMessages((prevMessages) => [...prevMessages, newMessage]);
    setInput('');
    setIsThinking(true);

    try {
      const botResponse = await sendMessage(prompt, {
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
      });
      const botMessage = { sender: 'bot', text: botResponse };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsThinking(false);
    }
  };

const mapEducationLevel = (educationLevel) => {
  if (educationLevel < 1) {
      return "No High School";
  } else if (educationLevel > 4) {
      return "College Degree or Above";
  }

  const educationLevelMapping = {
      1: "No High School",
      2: "High School",
      3: "College Dropout",
      4: "College Degree",
  };
return educationLevelMapping[educationLevel] || "Unknown"; // Return "Unknown" if the level is not found
};

const mapOccupation = (occupation) => {
  if (occupation < 1) {
    return "Employee";
} else if (occupation > 4) {
    return "Unemployed";
}

  const occupationMapping = {
      1: "Employee",
      2: "Self-employed",
      3: "Retired",
      4: "Unemployed",
  };

  return occupationMapping[occupation] || "Unknown"; // Return "Unknown" if the occupation is not found
};
const handleFetchUserPortrait = async () => {
  setIsThinking(true);
  try {
      const userId = localStorage.getItem('userId');
      console.log('User ID:', userId);
      const userPortraits = await fetchUserPortraits_chat(userId); // Fetch user portraits

      // Map the numeric education level to a label and replace the value
      userPortraits.education_level = mapEducationLevel(userPortraits.education_level);
      userPortraits.occupation = mapOccupation(userPortraits.occupation);
      delete userPortraits.created_at;
      setUserPortraits(userPortraits);

      const portraitMessage = { sender: 'bot', text: 'User Portraits fetched successfully' };
      setMessages((prevMessages) => [...prevMessages, portraitMessage]);
  } catch (error) {
      console.error('Error fetching user portraits:', error);
      const errorMessage = { sender: 'bot', text: 'Failed to fetch user portraits. Try again later.' };
      setMessages((prevMessages) => [...prevMessages, errorMessage]);
  } finally {
      setIsThinking(false);
  }
};
return (
  <>
    <div id="chat-button" className="chat-button" onClick={toggleChat}>
      <img src={chatIcon} alt="Chat" className="chat-icon" />
    </div>
    {chatVisible && (
      <div id="chat-area" className="chat-area">
        <div className="chat-header">
          <h4>Chat with AI</h4>
          <button id="close-chat" className="close-chat" onClick={toggleChat}>
            &times;
          </button>
        </div>
        <div className="chat-body">
          {messages.map((msg, index) => (
            <div key={index} className={`chat-message ${msg.sender}`}>
              {msg.text.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </div>
          ))}
          {isThinking && <div className="chat-message-thinking">AI advisor is thinking...</div>}
        </div>
        <div className="chat-footer">
          <button id="fetch-portrait" className="fetch-portrait" onClick={handleFetchUserPortrait}>
            Fetch User Portrait
          </button>
          <div className="input-container">
            <input
              type="text"
              id="chat-input"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button id="send-chat" className="send-chat" onClick={handleSend}>
              Send
            </button>
          </div>
          <button id="settings-button" className="settings-button" onClick={toggleSettings}>
            Settings
          </button>
        </div>
      </div>
    )}
    {settingsVisible && (
      <SettingsPopup
        temperature={temperature}
        setTemperature={setTemperature}
        topP={topP}
        setTopP={setTopP}
        frequencyPenalty={frequencyPenalty}
        setFrequencyPenalty={setFrequencyPenalty}
        presencePenalty={presencePenalty}
        setPresencePenalty={setPresencePenalty}
        toggleSettings={toggleSettings}
      />
    )}
  </>
);
};

export default Chat;