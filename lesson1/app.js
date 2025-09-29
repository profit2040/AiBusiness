// Global variables
let reviews = [];
let apiToken = '';

// DOM elements
const analyzeBtn = document.getElementById('analyze-btn');
const countNounsBtn = document.getElementById('count-nouns-btn');
const reviewText = document.getElementById('review-text');
const sentimentResult = document.getElementById('sentiment-result');
const nounResult = document.getElementById('noun-result');
const loadingElement = document.querySelector('.loading');
const errorElement = document.getElementById('error-message');
const apiTokenInput = document.getElementById('api-token');

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Load the TSV file (Papa Parse 활성화)
    loadReviews();
    
    // Set up event listeners
    analyzeBtn.addEventListener('click', analyzeRandomReview);
    countNounsBtn.addEventListener('click', countNounsInReview);
    apiTokenInput.addEventListener('change', saveApiToken);
    
    // Load saved API token if exists
    const savedToken = localStorage.getItem('hfApiToken');
    if (savedToken) {
        apiTokenInput.value = savedToken;
        apiToken = savedToken;
    }
});

// Load and parse the TSV file using Papa Parse
function loadReviews() {
    fetch('reviews_test.tsv')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load TSV file');
            return response.text();
        })
        .then(tsvData => {
            Papa.parse(tsvData, {
                header: true,
                delimiter: '\t',
                complete: (results) => {
                    reviews = results.data
                        .map(row => row.text)
                        .filter(text => text && text.trim() !== '');
                    console.log('Loaded', reviews.length, 'reviews');
                },
                error: (error) => {
                    console.error('TSV parse error:', error);
                    showError('Failed to parse TSV file: ' + error.message);
                }
            });
        })
        .catch(error => {
            console.error('TSV load error:', error);
            showError('Failed to load TSV file: ' + error.message);
        });
}

// Save API token to localStorage
function saveApiToken() {
    apiToken = apiTokenInput.value.trim();
    if (apiToken) {
        localStorage.setItem('hfApiToken', apiToken);
    } else {
        localStorage.removeItem('hfApiToken');
    }
}

// Analyze a random review
function analyzeRandomReview() {
    hideError();
    
    if (reviews.length === 0) {
        showError('No reviews available. Please try again later.');
        return;
    }
    
    const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
    
    // Display the review
    reviewText.textContent = selectedReview;
    
    // Show loading state
    loadingElement.style.display = 'block';
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = '';  // Reset previous result
    sentimentResult.className = 'sentiment-result';  // Reset classes
    nounResult.className = 'sentiment-result glass-card';
    nounResult.innerHTML = '<i class="fas fa-language icon"></i><span>Noun statistics will appear here</span>';
    
    // Call Hugging Face API
    analyzeSentiment(selectedReview)
        .then(result => displaySentiment(result))
        .catch(error => {
            console.error('Error:', error);
            showError('Failed to analyze sentiment: ' + error.message);
        })
        .finally(() => {
            loadingElement.style.display = 'none';
            analyzeBtn.disabled = false;
        });
}

function countNounsInReview() {
    hideError();
    const text = reviewText.textContent.trim();
    if (!text || text === 'Click the button above to analyze a random review') {
        showError('Select a review before counting nouns.');
        return;
    }
    nounResult.className = 'sentiment-result glass-card';
    nounResult.innerHTML = '<i class="fas fa-spinner fa-spin icon"></i><span>Counting nouns...</span>';
    countNounsBtn.disabled = true;
    analyzeNouns(text)
        .then(nouns => displayNounStats(nouns))
        .catch(error => {
            console.error('Error:', error);
            showError('Failed to count nouns: ' + error.message);
            nounResult.className = 'sentiment-result glass-card';
            nounResult.innerHTML = '<i class="fas fa-language icon"></i><span>Noun statistics unavailable</span>';
        })
        .finally(() => {
            countNounsBtn.disabled = false;
        });
}

// Call Hugging Face API for sentiment analysis
async function analyzeSentiment(text) {
    const response = await fetch(
        'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english',
        {
            headers: { 
                Authorization: apiToken ? `Bearer ${apiToken}` : undefined,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({ inputs: text }),
        }
    );
    
    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    return result;
}

async function analyzeNouns(text) {
    const response = await fetch(
        'https://api-inference.huggingface.co/models/vblagoje/bert-english-uncased-finetuned-pos',
        {
            headers: {
                Authorization: apiToken ? `Bearer ${apiToken}` : undefined,
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body: JSON.stringify({ inputs: text })
        }
    );
    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    const items = Array.isArray(data) ? data.flat(Infinity) : [];
    const nouns = [];
    items.forEach(item => {
        const label = (item.entity_group || item.entity || '').toUpperCase();
        if ((label.includes('NOUN') || label.includes('PROPN')) && Number.isInteger(item.start) && Number.isInteger(item.end)) {
            const word = text.slice(item.start, item.end).trim();
            if (word) {
                nouns.push(word);
            }
        }
    });
    return nouns;
}

function displayNounStats(nouns) {
    nounResult.className = 'sentiment-result glass-card';
    if (!Array.isArray(nouns) || nouns.length === 0) {
        nounResult.innerHTML = '<i class="fas fa-language icon"></i><span>No nouns detected</span>';
        return;
    }
    const counts = new Map();
    nouns.forEach(word => {
        const key = word.toLowerCase();
        const entry = counts.get(key) || { word, count: 0 };
        entry.count += 1;
        if (entry.count === 1) {
            entry.word = word;
        }
        counts.set(key, entry);
    });
    const summary = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
    const list = summary.slice(0, 10).map(item => `${item.word} (${item.count})`).join(', ');
    nounResult.innerHTML = `<i class="fas fa-language icon"></i><div><div><strong>${nouns.length}</strong> nouns, <strong>${summary.length}</strong> unique</div>${list ? `<div>${list}</div>` : ''}</div>`;
}

// Display sentiment result
function displaySentiment(result) {
    // Default to neutral if we can't parse the result
    let sentiment = 'neutral';
    let score = 0.5;
    let label = 'NEUTRAL';
    
    // Parse the API response (format: [[{label: 'POSITIVE', score: 0.99}]])
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0]) && result[0].length > 0) {
        const sentimentData = result[0][0];
        label = sentimentData.label?.toUpperCase() || 'NEUTRAL';
        score = sentimentData.score ?? 0.5;
        
        // Determine sentiment
        if (label === 'POSITIVE' && score > 0.5) {
            sentiment = 'positive';
        } else if (label === 'NEGATIVE' && score > 0.5) {
            sentiment = 'negative';
        }
    }
    
    // Update UI
    sentimentResult.classList.add(sentiment);
    sentimentResult.innerHTML = `
        <i class="fas ${getSentimentIcon(sentiment)} icon"></i>
        <span>${label} (${(score * 100).toFixed(1)}% confidence)</span>
    `;
}

// Get appropriate icon for sentiment
function getSentimentIcon(sentiment) {
    switch(sentiment) {
        case 'positive':
            return 'fa-thumbs-up';
        case 'negative':
            return 'fa-thumbs-down';
        default:
            return 'fa-question-circle';
    }
}

// Show error message
function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// Hide error message
function hideError() {
    errorElement.style.display = 'none';
}
