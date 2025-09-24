// Privacy & Terms page functionality
document.addEventListener('DOMContentLoaded', () => {
    // Get tab buttons
    const tabButtons = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Function to show a specific tab
    function showTab(tabName) {
        // Update tab buttons
        tabButtons.forEach((tab, index) => {
            tab.classList.remove('active');
            if ((tabName === 'privacy' && index === 0) || (tabName === 'terms' && index === 1)) {
                tab.classList.add('active');
            }
        });
        
        // Update content
        tabContents.forEach(content => {
            content.classList.remove('active');
        });
        const targetContent = document.getElementById(tabName);
        if (targetContent) {
            targetContent.classList.add('active');
        }
        
        // Update URL hash
        if (window.location.hash !== '#' + tabName) {
            window.location.hash = tabName;
        }
    }
    
    // Add click handlers to tab buttons
    tabButtons.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            const tabName = index === 0 ? 'privacy' : 'terms';
            showTab(tabName);
        });
    });
    
    // Handle initial hash on page load
    const initialHash = window.location.hash.substring(1);
    if (initialHash === 'terms') {
        showTab('terms');
    } else {
        // Default to privacy if no hash or privacy hash
        showTab('privacy');
    }
    
    // Handle hash changes while on the page
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.substring(1);
        if (hash === 'terms' || hash === 'privacy') {
            showTab(hash);
        }
    });
});