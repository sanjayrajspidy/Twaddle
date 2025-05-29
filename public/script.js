const socket = io();
const form = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const fileBtn = document.getElementById('file-btn');
const messages = document.getElementById('messages');
const themeToggle = document.getElementById('theme-toggle');

// Prompt for username
let username = prompt("Enter your name:");
if (!username) username = "Anonymous";

// Assign random color to username (same for session)
const userColor = getRandomColor();

function getRandomColor() {
  const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Add file button click handler
fileBtn.addEventListener('click', () => {
  fileInput.click();
});

// Add styles dynamically for file button and copyright
const dynamicStyles = document.createElement('style');
dynamicStyles.textContent = `
  /* File attach button styling */
  .file-attach-btn {
    background: linear-gradient(135deg, #3498db, #2980b9);
    color: white;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 2px 10px rgba(52, 152, 219, 0.3);
    position: relative;
    overflow: hidden;
  }

  .file-attach-btn:hover {
    background: linear-gradient(135deg, #2980b9, #1f5f8b);
    transform: scale(1.1) rotate(45deg);
    box-shadow: 0 4px 20px rgba(52, 152, 219, 0.5);
  }

  .file-attach-btn:active {
    transform: scale(0.95) rotate(45deg);
    box-shadow: 0 2px 5px rgba(52, 152, 219, 0.3);
  }

  /* Dark mode file button */
  .dark .file-attach-btn {
    background: linear-gradient(135deg, #e74c3c, #c0392b);
    box-shadow: 0 2px 10px rgba(231, 76, 60, 0.3);
  }

  .dark .file-attach-btn:hover {
    background: linear-gradient(135deg, #c0392b, #a93226);
    box-shadow: 0 4px 20px rgba(231, 76, 60, 0.5);
  }

  /* Copyright styling */
  .copyright {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.1);
    color: #7f8c8d;
    padding: 8px 15px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 100;
    transition: all 0.3s ease;
  }

  .dark .copyright {
    background: rgba(255, 255, 255, 0.1);
    color: #bdc3c7;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .copyright:hover {
    background: rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }

  .dark .copyright:hover {
    background: rgba(255, 255, 255, 0.2);
  }
`;
document.head.appendChild(dynamicStyles);

// Format timestamp for display
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Create message element with improved styling
function createMessageElement(data) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message');
  
  // Determine if this is the current user's message
  const isOwnMessage = (data.username || data.user) === username;
  msgDiv.classList.add(isOwnMessage ? 'own-message' : 'other-message');
  
  const timestamp = formatTimestamp(data.timestamp);
  
  // Create message bubble
  const bubbleDiv = document.createElement('div');
  bubbleDiv.classList.add('message-bubble');
  
  // Create message header
  const headerDiv = document.createElement('div');
  headerDiv.classList.add('message-header');
  headerDiv.innerHTML = `
    <span class="username" style="color:${data.user_color || data.color}">${data.username || data.user}</span>
    <span class="timestamp">${timestamp}</span>
  `;
  
  // Create message content
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.textContent = data.message_text || data.text || '';
  
  // Add file link if present
  if (data.file_url || data.fileUrl) {
    const fileLink = document.createElement('a');
    fileLink.href = data.file_url || data.fileUrl;
    fileLink.textContent = `📎 ${data.file_name || data.fileName || 'File'}`;
    fileLink.target = "_blank";
    fileLink.classList.add('file-link');
    contentDiv.appendChild(fileLink);
  }
  
  // Assemble the message
  bubbleDiv.appendChild(headerDiv);
  bubbleDiv.appendChild(contentDiv);
  msgDiv.appendChild(bubbleDiv);
  
  // Add animation class for new messages
  msgDiv.classList.add('new-message');
  
  // Store timestamp for updates
  msgDiv.dataset.timestamp = data.timestamp;
  
  return msgDiv;
}

// Enhanced form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const messageText = input.value.trim();
  const file = fileInput.files[0];

  // Don't send empty messages unless there's a file
  if (!messageText && !file) return;

  // Add visual feedback
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Sending...';
  submitBtn.disabled = true;

  try {
    if (file) {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const result = await response.json();
      socket.emit('chat message', {
        user: username,
        color: userColor,
        text: messageText,
        fileUrl: result.fileUrl,
        fileName: result.fileName
      });
    } else {
      socket.emit('chat message', {
        user: username,
        color: userColor,
        text: messageText
      });
    }

    // Clear inputs
    input.value = '';
    fileInput.value = '';
    
    // Focus back to input
    input.focus();
    
  } catch (error) {
    console.error('Message send failed:', error);
    alert('Failed to send message. Please try again.');
  } finally {
    // Restore button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
});

// Handle chat history (when user connects)
socket.on('chat history', (history) => {
  messages.innerHTML = ''; // Clear existing messages
  history.forEach(data => {
    const msgElement = createMessageElement(data);
    messages.appendChild(msgElement);
  });
  scrollToBottom();
});

// Handle new messages
socket.on('chat message', (data) => {
  const msgElement = createMessageElement(data);
  messages.appendChild(msgElement);
  scrollToBottom();
  
  // Add notification sound for other users' messages
  if ((data.username || data.user) !== username) {
    playNotificationSound();
  }
});

// Smooth scroll to bottom
function scrollToBottom() {
  messages.scrollTo({
    top: messages.scrollHeight,
    behavior: 'smooth'
  });
}

// Enhanced theme toggle
themeToggle.addEventListener('click', () => {
  const body = document.body;
  body.classList.toggle('dark');
  body.classList.toggle('light');
  
  const isDark = body.classList.contains('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  
  // Store theme preference without localStorage (using in-memory storage)
  window.currentTheme = isDark ? 'dark' : 'light';
});

// Load default theme
document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  // Default to light theme
  body.classList.add('light');
  themeToggle.textContent = '🌙';
  window.currentTheme = 'light';
});

// Enhanced Speech to Text Feature
const micBtn = document.getElementById("mic-btn");
let isRecording = false;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.continuous = false;

  micBtn.addEventListener('click', () => {
    if (!isRecording) {
      try {
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        micBtn.innerHTML = '<span class="pulse"></span>🛑';
        input.placeholder = "Listening...";
      } catch (error) {
        console.error('Speech recognition start error:', error);
        showNotification('Failed to start voice recording', 'error');
      }
    } else {
      recognition.stop();
      stopRecording();
    }
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    input.value = transcript;
    stopRecording();
    showNotification('Voice message captured!', 'success');
    input.focus();
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    stopRecording();
    showNotification('Voice recognition failed. Please try again.', 'error');
  };

  recognition.onend = () => {
    stopRecording();
  };

  function stopRecording() {
    isRecording = false;
    micBtn.classList.remove('recording');
    micBtn.innerHTML = '🎤';
    input.placeholder = "Type or speak your message...";
  }
} else {
  micBtn.disabled = true;
  micBtn.title = "Speech recognition not supported in this browser";
  micBtn.innerHTML = '🎤❌';
  micBtn.style.opacity = '0.5';
}

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.classList.add('notification', type);
  notification.textContent = message;
  
  const style = {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '1rem 1.5rem',
    borderRadius: '10px',
    color: 'white',
    fontWeight: '600',
    zIndex: '1000',
    animation: 'slideInRight 0.3s ease-out',
    maxWidth: '300px',
    wordWrap: 'break-word'
  };
  
  if (type === 'success') {
    style.background = 'linear-gradient(135deg, #27ae60, #229954)';
  } else if (type === 'error') {
    style.background = 'linear-gradient(135deg, #e74c3c, #c0392b)';
  } else {
    style.background = 'linear-gradient(135deg, #3498db, #2980b9)';
  }
  
  Object.assign(notification.style, style);
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Add notification animations to CSS dynamically
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(notificationStyles);

// Simple notification sound
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (error) {
    // Fallback: no sound if audio context fails
    console.log('Notification sound not available');
  }
}

// Enhanced keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Send message with Ctrl+Enter or Cmd+Enter
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    form.dispatchEvent(new Event('submit'));
  }
  
  // Focus input with Escape key
  if (e.key === 'Escape') {
    input.focus();
    input.select();
  }
  
  // Toggle theme with Ctrl+D or Cmd+D
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault();
    themeToggle.click();
  }
});

// Auto-resize text input
input.addEventListener('input', () => {
  // Reset height to auto to get the correct scrollHeight
  input.style.height = 'auto';
  // Set height based on scrollHeight (with max height)
  const maxHeight = 120; // Maximum height before scrolling
  const newHeight = Math.min(input.scrollHeight, maxHeight);
  input.style.height = newHeight + 'px';
});

// Optional: Add function to clear chat history with confirmation
function clearChatHistory() {
  if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
    fetch('/api/messages', { method: 'DELETE' })
      .then(response => response.json())
      .then(result => {
        console.log(result.message);
        messages.innerHTML = '';
        showNotification('Chat history cleared', 'success');
      })
      .catch(error => {
        console.error('Error clearing chat history:', error);
        showNotification('Failed to clear chat history', 'error');
      });
  }
}

// Update timestamps every minute
setInterval(() => {
  const messageElements = document.querySelectorAll('.message');
  messageElements.forEach((messageElement) => {
    const timestamp = messageElement.dataset.timestamp;
    if (timestamp) {
      const timestampElement = messageElement.querySelector('.timestamp');
      if (timestampElement) {
        timestampElement.textContent = formatTimestamp(timestamp);
      }
    }
  });
}, 60000); // Update every minute

// Connection status indicator
socket.on('connect', () => {
  showNotification('Connected to chat', 'success');
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  showNotification('Disconnected from chat', 'error');
  console.log('Disconnected from server');
});

socket.on('reconnect', () => {
  showNotification('Reconnected to chat', 'success');
  console.log('Reconnected to server');
});

// File drag and drop functionality
let dragCounter = 0;

messages.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragCounter++;
  messages.classList.add('drag-over');
});

messages.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    messages.classList.remove('drag-over');
  }
});

messages.addEventListener('dragover', (e) => {
  e.preventDefault();
});

messages.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  messages.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    fileInput.files = files;
    showNotification(`File "${files[0].name}" ready to send`, 'info');
    input.focus();
  }
});

// Add drag-over styling
const dragStyles = document.createElement('style');
dragStyles.textContent = `
  .drag-over {
    border: 2px dashed #3498db !important;
    background: rgba(52, 152, 219, 0.1) !important;
  }
  .drag-over::after {
    content: "Drop files here to attach";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(52, 152, 219, 0.9);
    color: white;
    padding: 1rem 2rem;
    border-radius: 10px;
    font-weight: bold;
    font-size: 1.2rem;
    z-index: 10;
  }
`;
document.head.appendChild(dragStyles);

// Auto-scroll to bottom when new message arrives
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if user is near the bottom before auto-scrolling
      const isNearBottom = messages.scrollTop + messages.clientHeight >= messages.scrollHeight - 100;
      if (isNearBottom) {
        scrollToBottom();
      }
    }
  });
});

observer.observe(messages, { childList: true });

// Initialize focus on input when page loads
window.addEventListener('load', () => {
  input.focus();
  showNotification(`Welcome, ${username}!`, 'success');
});

// Add typing indicator (optional feature for future enhancement)
let typingTimer;
const TYPING_DELAY = 1000; // 1 second

input.addEventListener('input', () => {
  // Clear existing timer
  clearTimeout(typingTimer);
  
  // Emit typing start event
  socket.emit('typing start', { user: username });
  
  // Set timer to emit typing stop event
  typingTimer = setTimeout(() => {
    socket.emit('typing stop', { user: username });
  }, TYPING_DELAY);
});

// Handle typing indicators from other users
socket.on('user typing', (data) => {
  if (data.user !== username) {
    showTypingIndicator(data.user);
  }
});

socket.on('user stopped typing', (data) => {
  if (data.user !== username) {
    hideTypingIndicator(data.user);
  }
});

function showTypingIndicator(user) {
  const existingIndicator = document.getElementById(`typing-${user}`);
  if (!existingIndicator) {
    const indicator = document.createElement('div');
    indicator.id = `typing-${user}`;
    indicator.classList.add('typing-indicator');
    indicator.innerHTML = `
      <span class="username" style="color: ${getRandomColor()}">${user}</span> is typing
      <span class="dots">
        <span>.</span><span>.</span><span>.</span>
      </span>
    `;
    messages.appendChild(indicator);
    scrollToBottom();
  }
}

function hideTypingIndicator(user) {
  const indicator = document.getElementById(`typing-${user}`);
  if (indicator) {
    indicator.remove();
  }
}

// Add CSS for typing indicator dots animation
const typingStyles = document.createElement('style');
typingStyles.textContent = `
  .typing-indicator {
    padding: 0.5rem 1rem;
    margin: 0.5rem 0;
    color: #7f8c8d;
    font-style: italic;
    font-size: 0.9rem;
    opacity: 0.8;
  }
  
  .dots span {
    animation: typingDots 1.4s infinite;
    opacity: 0;
  }
  
  .dots span:nth-child(1) { animation-delay: 0s; }
  .dots span:nth-child(2) { animation-delay: 0.2s; }
  .dots span:nth-child(3) { animation-delay: 0.4s; }
  
  @keyframes typingDots {
    0%, 60%, 100% { opacity: 0; }
    30% { opacity: 1; }
  }
`;
document.head.appendChild(typingStyles);