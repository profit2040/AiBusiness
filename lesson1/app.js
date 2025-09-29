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
const defaultReviewMessage = reviewText.textContent;
const defaultNounMessage = nounResult.querySelector('span').textContent;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    // Load the TSV file (Papa Parse 활성화)
    loadReviews();

    // Set up event listeners
    analyzeBtn.addEventListener('click', analyzeRandomReview);
    countNounsBtn.addEventListener('click', countNouns);
    apiTokenInput.addEventListener('change', saveApiToken);
    countNounsBtn.disabled = true;

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
    updateNounResult('fa-language', defaultNounMessage);
    countNounsBtn.disabled = false;

    // Show loading state
    loadingElement.style.display = 'block';
    analyzeBtn.disabled = true;
    sentimentResult.innerHTML = '';  // Reset previous result
    sentimentResult.className = 'sentiment-result';  // Reset classes
    
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

// Call Hugging Face API for sentiment analysis
async function analyzeSentiment(text) {
    const result = await postModel(
        'https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english',
        { inputs: text }
    );
    return result;
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

async function countNouns() {
    hideError();
    const text = reviewText.textContent.trim();
    if (!text || text === defaultReviewMessage) {
        showError('Please analyze a review before counting nouns.');
        return;
    }
    countNounsBtn.disabled = true;
    updateNounResult('fa-spinner', 'Counting nouns...', true);
    try {
        const tokens = await analyzePos(text);
        const summary = summarizeNouns(tokens, text);
        if (summary.total === 0) {
            updateNounResult('fa-language', 'No nouns detected');
        } else {
            const details = summary.breakdown
                .slice(0, 5)
                .map(item => `${item.word} (${item.count})`)
                .join(', ');
            const extra = summary.breakdown.length > 5 ? `, +${summary.breakdown.length - 5} more` : '';
            updateNounResult('fa-language', `${summary.total} nouns detected • ${details}${extra}`);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to count nouns: ' + error.message);
        updateNounResult('fa-language', defaultNounMessage);
    } finally {
        countNounsBtn.disabled = false;
    }
}

async function analyzePos(text) {
    const result = await postModel(
        'https://api-inference.huggingface.co/models/vblagoje/bert-english-uncased-finetuned-pos',
        { inputs: text }
    );
    if (!Array.isArray(result)) {
        throw new Error('Unexpected API response');
    }
    return result;
}

async function postModel(url, payload) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiToken) {
        headers.Authorization = `Bearer ${apiToken}`;
    }
    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

function summarizeNouns(tokens, text) {
    const nounTags = new Set(['NOUN', 'PROPN']);
    const counts = new Map();
    let total = 0;
    tokens.forEach(token => {
        const group = token.entity_group || token.entity || token.tag;
        if (!group || !nounTags.has(group.toUpperCase())) {
            return;
        }
        const surface = extractSurface(text, token);
        if (!surface) {
            return;
        }
        total += 1;
        const key = surface.toLowerCase();
        if (counts.has(key)) {
            counts.get(key).count += 1;
        } else {
            counts.set(key, { word: surface, count: 1 });
        }
    });
    return { total, breakdown: Array.from(counts.values()).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word)) };
}

function extractSurface(text, token) {
    if (typeof token.start === 'number' && typeof token.end === 'number') {
        const value = text.slice(token.start, token.end).trim();
        if (value) {
            return value;
        }
    }
    if (token.word) {
        return token.word.replace(/^##/, '').replace(/^Ġ/, '').trim();
    }
    return '';
}

function updateNounResult(iconClass, message, spinning) {
    nounResult.innerHTML = '';
    const icon = document.createElement('i');
    icon.className = `fas ${iconClass} icon`;
    if (spinning) {
        icon.classList.add('fa-spin');
    }
    const span = document.createElement('span');
    span.textContent = message;
    nounResult.append(icon, span);
}
