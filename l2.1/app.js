// Cache loaded reviews and the currently displayed record
let reviews = [];
let currentReview = null;

// Shared configuration for the Zephyr endpoint and token-free noun heuristic
const API_URL = 'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta';
const STOP_WORDS = new Set([
    'a','an','and','are','as','at','be','but','by','for','if','in','into','is','it','no','not','of','on','or','such','that','the','their','then','there','these','they','this','to','was','will','with'
]);

// Bootstraps the UI when the document is ready
document.addEventListener('DOMContentLoaded', async () => {
    await loadReviews();
    document.getElementById('randomReview').addEventListener('click', selectRandomReview);
    document.getElementById('analyzeSentiment').addEventListener('click', analyzeSentiment);
    document.getElementById('countNouns').addEventListener('click', countNouns);
});

// Loads TSV data, parses it with PapaParse, and stores non-empty reviews
async function loadReviews() {
    try {
        const response = await fetch('reviews_test.tsv');
        const tsv = await response.text();
        const parsed = Papa.parse(tsv, { header: true, delimiter: '\t', skipEmptyLines: true });
        reviews = parsed.data.filter(row => row.text && row.text.trim() !== '');
        if (reviews.length === 0) {
            showError('No reviews were found in the dataset.');
        }
    } catch (error) {
        showError('Unable to load reviews: ' + error.message);
    }
}

// Picks a random review, resets the results, and hides previous errors
function selectRandomReview() {
    if (reviews.length === 0) {
        showError('No reviews available');
        return;
    }
    currentReview = reviews[Math.floor(Math.random() * reviews.length)];
    document.getElementById('reviewText').textContent = currentReview.text;
    resetResults();
    hideError();
}

// Builds the sentiment prompt and sends it to the API
async function analyzeSentiment() {
    if (!currentReview) {
        showError('Please select a review first');
        return;
    }
    const prompt = `You are an exact sentiment analyst. Classify the review as Positive, Negative, or Neutral and respond with only that single word. Review: ${currentReview.text}`;
    await callApi(prompt, 'sentiment');
}

// Builds the noun-count prompt and sends it to the API
async function countNouns() {
    if (!currentReview) {
        showError('Please select a review first');
        return;
    }
    const prompt = `You count nouns precisely. Read the review and respond with only one word: High (more than 15 nouns), Medium (between 6 and 15 nouns), or Low (fewer than 6 nouns). Review: ${currentReview.text}`;
    await callApi(prompt, 'nouns');
}

// Handles the network request, normalizes the response, and dispatches updates
async function callApi(prompt, type) {
    const token = document.getElementById('token').value.trim();
    const spinner = document.getElementById('spinner');
    hideError();
    spinner.style.display = 'block';
    disableButtons(true);

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(API_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 32,
                    temperature: 0.2,
                    return_full_text: false
                }
            })
        });
        if (response.status === 402) {
            throw new Error('API token required for this model');
        }
        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }
        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }
        const payload = await response.json();
        const text = extractGeneratedText(payload).toLowerCase();
        if (type === 'sentiment') {
            updateSentimentResult(text);
        } else if (type === 'nouns') {
            updateNounResult(text, currentReview?.text || '');
        }
    } catch (error) {
        showError(error.message);
    } finally {
        spinner.style.display = 'none';
        disableButtons(false);
    }
}

// Reads the first generated_text field from the inference payload
function extractGeneratedText(payload) {
    if (Array.isArray(payload)) {
        return payload[0]?.generated_text || '';
    }
    if (payload && typeof payload === 'object') {
        return payload.generated_text || '';
    }
    return '';
}

// Maps sentiment keywords to icons for display
function updateSentimentResult(text) {
    const keyword = extractKeyword(text, ['positive', 'negative', 'neutral']);
    let icon = '❓';
    if (keyword === 'positive') {
        icon = '👍';
    } else if (keyword === 'negative') {
        icon = '👎';
    } else if (keyword === 'neutral') {
        icon = '❓';
    }
    document.getElementById('sentimentResult').textContent = icon;
}

// Normalizes noun level, applies heuristic validation, and renders icon
function updateNounResult(text, reviewText) {
    const keyword = extractKeyword(text, ['high', 'medium', 'low']);
    const validated = keyword || heuristicNounLevel(reviewText);
    let icon = '❓';
    if (validated === 'high') {
        icon = '🟢';
    } else if (validated === 'medium') {
        icon = '🟡';
    } else if (validated === 'low') {
        icon = '🔴';
    }
    document.getElementById('nounResult').textContent = icon;
}

// Resets sentiment and noun indicators to their neutral state
function resetResults() {
    document.getElementById('sentimentResult').textContent = '❓';
    document.getElementById('nounResult').textContent = '❓';
}

// Enables or disables all control buttons
function disableButtons(disabled) {
    document.querySelectorAll('button').forEach(button => {
        button.disabled = disabled;
    });
}

// Displays an error banner with the supplied message
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

// Hides the error banner
function hideError() {
    document.getElementById('error').style.display = 'none';
}

// Finds the first keyword in a string from a given list
function extractKeyword(text, keywords) {
    const pattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'i');
    const match = text.match(pattern);
    return match ? match[1].toLowerCase() : null;
}

// Estimates noun levels by counting non-stop words as a safeguard
function heuristicNounLevel(text) {
    const tokens = text.toLowerCase().match(/[a-z']+/g) || [];
    const candidates = tokens.filter(word => !STOP_WORDS.has(word));
    if (candidates.length > 15) {
        return 'high';
    }
    if (candidates.length >= 6) {
        return 'medium';
    }
    return 'low';
}
