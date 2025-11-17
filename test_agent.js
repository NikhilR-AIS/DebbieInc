const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Test prompts designed to break or challenge the agent
const testPrompts = [
    // Logical contradictions
    "This statement is false.",
    "The following statement is true. The previous statement is false.",
    
    // Self-reference paradoxes
    "I am lying right now. Is this true?",
    "What is the answer to this question?",
    
    // Circular reasoning
    "Why is water wet? Because it's wet.",
    "What makes a circle round? Because circles are round.",
    
    // Impossible questions
    "What color is the number seven?",
    "What does the taste of purple feel like?",
    "How many sides does a circle have?",
    
    // Division by zero type errors
    "What is infinity divided by infinity?",
    "If I cut nothing in half, how many pieces do I have?",
    
    // Time paradoxes
    "What happened before the beginning of time?",
    "If time doesn't exist, when did it start?",
    
    // Resume-specific edge cases
    "What is my resume?",
    "Tell me about my work experience before I was born.",
    "How many years of experience do I have in a job I never had?",
    "Generate a resume for someone who has never worked or gone to school.",
    
    // Nonsensical inputs
    "Resume the if",
    "Create a job in futurity tense",
    "I worked at %NULL% from %ERROR% to %EXCEPTION%",
    "What is 2+2 if logic doesn't exist?",
    
    // Buffer overflow / extreme inputs
    "A".repeat(10000) + " resume",
    "What is " + "very ".repeat(1000) + "important?",
    
    // SQL/Code injection attempts (common vulnerability)
    "'; DROP TABLE resumes; --",
    "<script>alert('test')</script>",
    "{{7*7}}",
    
    // Unicode and special characters
    "résumé résumé " + "résumé".repeat(100),
    "🎓💼📝".repeat(50),
    
    // Empty/null inputs
    "",
    "   ",
    "null",
    "undefined",
    
    // Mathematical impossibilities
    "What is the square root of a resume?",
    "If experience is relative, how do I calculate my absolute experience?",
    
    // Meta questions
    "What is the purpose of this conversation?",
    "Are you really helping me or just pretending?",
    "Prove that you exist.",
    
    // Extremely specific impossible requests
    "Create a resume that proves I invented time travel in 1975",
    "Show me where I worked on Mars last year",
    "List all my coworkers from my job at Atlantis",
];

class AgentTestResults {
    constructor() {
        this.results = [];
        this.totalTests = 0;
        this.errors = 0;
        this.strangeResponses = 0;
    }
    
    addResult(prompt, response, status, notes = '') {
        this.totalTests++;
        if (status === 'error') this.errors++;
        if (status === 'strange') this.strangeResponses++;
        
        this.results.push({
            timestamp: new Date().toISOString(),
            prompt: prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt,
            fullPrompt: prompt,
            response: response?.substring(0, 500) || 'No response',
            fullResponse: response || 'No response',
            status,
            notes
        });
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAgent() {
    console.log('Starting agent tests...\n');
    const results = new AgentTestResults();
    
    // Launch browser
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 500 // Slow down for visibility
    });
    
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // Navigate to the HTML file
        const htmlPath = 'file://' + path.resolve(__dirname, 'significance.html');
        console.log(`Loading: ${htmlPath}`);
        await page.goto(htmlPath);
        
        // Wait longer for the data app to load
        console.log('Waiting for DataApp to load...');
        await sleep(8000);
        
        // Inspect page structure
        console.log('\n=== Page Structure ===');
        const html = await page.content();
        console.log('HTML length:', html.length);
        
        // Try to get all input elements
        const allInputs = await page.$$('input');
        console.log(`Found ${allInputs.length} input elements`);
        
        // Try to get all textareas
        const allTextareas = await page.$$('textarea');
        console.log(`Found ${allTextareas.length} textarea elements`);
        
        // Try to get contenteditable elements
        const allEditable = await page.$$('[contenteditable]');
        console.log(`Found ${allEditable.length} contenteditable elements`);
        
        // Log visible text
        const bodyText = await page.textContent('body');
        console.log('\nBody text preview:', bodyText.substring(0, 500));
        
        // Take initial screenshot
        await page.screenshot({ path: 'initial_load.png' });
        console.log('Screenshot saved: initial_load.png');
        
        console.log('\n=== Beginning tests ===\n');
        
        // Try to find the chat interface or input field
        // This is exploratory - we need to see what elements exist
        let hasInput = false;
        
        try {
            // Try to find common chat input selectors
            const selectors = [
                'input[type="text"]',
                'textarea',
                '[contenteditable="true"]',
                'input',
                '.chat-input',
                '#chat-input',
                '[placeholder*="message" i]',
                '[placeholder*="ask" i]',
                '[placeholder*="question" i]'
            ];
            
            let inputElement = null;
            for (const selector of selectors) {
                inputElement = await page.$(selector);
                if (inputElement) {
                    console.log(`Found input with selector: ${selector}`);
                    hasInput = true;
                    break;
                }
            }
            
            if (!hasInput) {
                console.log('No input field found. Element structure:');
                const body = await page.textContent('body');
                console.log(body.substring(0, 500));
            }
            
        } catch (err) {
            console.log('Could not find input field:', err.message);
        }
        
        // Run each test prompt
        for (let i = 0; i < testPrompts.length; i++) {
            const prompt = testPrompts[i];
            console.log(`\n[${i + 1}/${testPrompts.length}] Testing: ${prompt.substring(0, 60)}...`);
            
            try {
                if (!hasInput) {
                    results.addResult(prompt, 'No input field found in UI', 'error');
                    continue;
                }
                
                // Type the prompt (if input exists)
                const inputSelector = await findInputElement(page);
                if (inputSelector) {
                    await page.fill(inputSelector, prompt);
                    await sleep(500);
                    
                    // Try to submit
                    await page.press(inputSelector, 'Enter');
                    await sleep(2000);
                    
                    // Try to find response
                    let response = 'Could not find response element';
                    const responseSelectors = [
                        '.response',
                        '.message',
                        '.result',
                        '#response',
                        '.chat-message',
                        '[class*="message"]'
                    ];
                    
                    for (const selector of responseSelectors) {
                        const element = await page.$(selector);
                        if (element) {
                            response = await element.textContent();
                            break;
                        }
                    }
                    
                    // Analyze response
                    let status = 'normal';
                    if (response.includes('error') || response.includes('Error')) {
                        status = 'error';
                    } else if (response.length < 10 || response === prompt) {
                        status = 'strange';
                    }
                    
                    results.addResult(prompt, response, status);
                    console.log(`Status: ${status}`);
                }
                
            } catch (error) {
                results.addResult(prompt, error.message, 'error', error.stack);
                console.log(`Error: ${error.message}`);
            }
            
            // Break between tests
            await sleep(1000);
        }
        
        // Take a screenshot for debugging
        await page.screenshot({ path: 'agent_test_screenshot.png' });
        console.log('\nScreenshot saved: agent_test_screenshot.png');
        
    } catch (error) {
        console.error('Test execution error:', error);
        results.addResult('Browser navigation', error.message, 'error', error.stack);
    } finally {
        await browser.close();
    }
    
    // Generate report
    await generateReport(results);
}

async function findInputElement(page) {
    const selectors = [
        'input[type="text"]',
        'textarea',
        '[contenteditable="true"]',
        'input:not([type="hidden"])',
        '[placeholder*="message" i]',
        '[placeholder*="ask" i]',
        '[placeholder*="question" i]',
        '.chat-input',
        '#chat-input'
    ];
    
    for (const selector of selectors) {
        try {
            const element = await page.$(selector);
            if (element) {
                return selector;
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

async function generateReport(results) {
    console.log('\n' + '='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${results.totalTests}`);
    console.log(`Errors: ${results.errors}`);
    console.log(`Strange Responses: ${results.strangeResponses}`);
    console.log(`Normal Responses: ${results.totalTests - results.errors - results.strangeResponses}`);
    console.log('\n');
    
    // Save detailed results to notes file
    const notesFile = path.join(__dirname, 'agent_test_notes.md');
    
    let content = `# Agent Testing Notes\n\n`;
    content += `**Test Date:** ${new Date().toISOString()}\n\n`;
    content += `**Summary:**\n`;
    content += `- Total Tests: ${results.totalTests}\n`;
    content += `- Errors: ${results.errors}\n`;
    content += `- Strange Responses: ${results.strangeResponses}\n`;
    content += `- Normal Responses: ${results.totalTests - results.errors - results.strangeResponses}\n\n`;
    content += `---\n\n`;
    
    // Group by status
    const byStatus = {
        error: [],
        strange: [],
        normal: []
    };
    
    results.results.forEach(r => {
        byStatus[r.status].push(r);
    });
    
    // Write errors section
    if (byStatus.error.length > 0) {
        content += `## Errors (${byStatus.error.length})\n\n`;
        byStatus.error.forEach((r, i) => {
            content += `### Error ${i + 1}\n`;
            content += `**Prompt:** \`${r.fullPrompt}\`\n\n`;
            content += `**Response:** ${r.fullResponse}\n\n`;
            content += `**Notes:** ${r.notes}\n\n`;
            content += `---\n\n`;
        });
    }
    
    // Write strange responses section
    if (byStatus.strange.length > 0) {
        content += `## Strange Responses (${byStatus.strange.length})\n\n`;
        byStatus.strange.forEach((r, i) => {
            content += `### Strange Response ${i + 1}\n`;
            content += `**Prompt:** \`${r.fullPrompt}\`\n\n`;
            content += `**Response:** ${r.fullResponse}\n\n`;
            content += `---\n\n`;
        });
    }
    
    // Write all results section
    content += `## All Test Results\n\n`;
    results.results.forEach((r, i) => {
        content += `### Test ${i + 1} - ${r.status.toUpperCase()}\n`;
        content += `**Prompt:** \`${r.fullPrompt}\`\n\n`;
        content += `**Response:** ${r.fullResponse}\n\n`;
        content += `**Timestamp:** ${r.timestamp}\n\n`;
        if (r.notes) {
            content += `**Notes:** ${r.notes}\n\n`;
        }
        content += `---\n\n`;
    });
    
    await fs.writeFile(notesFile, content);
    console.log(`Detailed results saved to: ${notesFile}`);
}

// Run the tests
testAgent().catch(console.error);

