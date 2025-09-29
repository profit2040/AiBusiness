let reviews = [];
let currentReview = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadReviews();
    
    document.getElementById('randomReview').addEventListener('click', selectRandomReview);
    document.getElementById('analyzeSentiment').addEventListener('click', analyzeSentiment);
    document.getElementById('countNouns').addEventListener('click', countNouns);
});

async function loadReviews() {
    try {
        const response = await fetch('reviews_test.tsv');
        const tsvData = await response.text();
        
        const parsed = Papa.parse(tsvData, {
            header: true,
            delimiter: '\t',
            skipEmptyLines: true
        });
        
        reviews = parsed.data.filter(review => review.text && review.text.trim() !== '');
    } catch (error) {
        showError('Failed to load reviews data: ' + error.message);
    }
}

function selectRandomReview() {
    if (reviews.length === 0) {
        showError('No reviews available');
        return;
    }
    
    const randomIndex = Math.floor(Math.random() * reviews.length);
    currentReview = reviews[randomIndex];
    document.getElementById('reviewText').textContent = currentReview.text;
    
    resetResults();
    hideError();
}

async function analyzeSentiment() {
    if (!currentReview) {
        showError('Please select a review first');
        return;
    }
    
    const prompt = `Classify this review as positive, negative, or neutral: ${currentReview.text}`;
    await callApi(prompt, 'sentiment');
}

async function countNouns() {
    if (!currentReview) {
        showError('Please select a review first');
        return;
    }
    
    const prompt = `Count the nouns in this review and return only **High** (>15), **Medium** (6-15), or **Low** (<6). ${currentReview.text}`;
    await callApi(prompt, 'nouns');
}

async function callApi(prompt, type) {
    const token = document.getElementById('token').value.trim();
    const spinner = document.getElementById('spinner');
    const errorDiv = document.getElementById('error');
    
    hideError();
    spinner.style.display = 'block';
    disableButtons(true);
    
    try {
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch('https://api-inference.huggingface.co/models/tiiuae/falcon-7b-instruct', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ inputs: prompt })
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
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        const resultText = data[0]?.generated_text || '';
        const firstLine = resultText.split('\n')[0].toLowerCase();
        
        if (type === 'sentiment') {
            updateSentimentResult(firstLine);
        } else if (type === 'nouns') {
            updateNounResult(firstLine);
        }
        
    } catch (error) {
        showError(error.message);
    } finally {
        spinner.style.display = 'none';
        disableButtons(false);
    }
}

function updateSentimentResult(text) {
    let icon = '❓';
    
    if (text.includes('positive')) {
        icon = '👍';
    } else if (text.includes('negative')) {
        icon = '👎';
    } else if (text.includes('neutral')) {
        icon = '❓';
    }
    
    document.getElementById('sentimentResult').textContent = icon;
}

function updateNounResult(text) {
    let icon = '❓';
    
    if (text.includes('high')) {
        icon = '🟢';
    } else if (text.includes('medium')) {
        icon = '🟡';
    } else if (text.includes('low')) {
        icon = '🔴';
    }
    
    document.getElementById('nounResult').textContent = icon;
}

function resetResults() {
    document.getElementById('sentimentResult').textContent = '❓';
    document.getElementById('nounResult').textContent = '❓';
}

function disableButtons(disabled) {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(button => {
        button.disabled = disabled;
    });
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('error');
    errorDiv.style.display = 'none';
}
