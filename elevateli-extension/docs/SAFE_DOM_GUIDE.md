# Safe DOM Manipulation Guide for ElevateLI

This guide shows how to add new functionality using safe DOM methods instead of innerHTML.

## Quick Reference

### ❌ DON'T DO THIS (innerHTML)
```javascript
element.innerHTML = '<div class="alert">Hello World</div>';
element.innerHTML += '<p>More content</p>';
container.innerHTML = `
  <div class="card">
    <h3>${title}</h3>
    <p>${description}</p>
  </div>
`;
```

### ✅ DO THIS INSTEAD (Safe DOM)
```javascript
// Simple element
const div = this.dom.createElement('div', {
  className: 'alert'
}, 'Hello World');
element.appendChild(div);

// Adding more content
const p = this.dom.createElement('p', {}, 'More content');
element.appendChild(p);

// Complex structure
const card = this.dom.createElementWithChildren('div', 
  { className: 'card' },
  [
    this.dom.createElement('h3', {}, title),
    this.dom.createElement('p', {}, description)
  ]
);
container.appendChild(card);
```

## Common Patterns

### 1. Creating a Status Message
```javascript
// Instead of:
statusDiv.innerHTML = `<div class="status-${type}">${icon} ${message}</div>`;

// Use:
const statusEl = this.dom.createElement('div', {
  className: `status-${type}`
}, `${icon} ${message}`);
this.dom.replaceChildren(statusDiv, [statusEl]);
```

### 2. Building a List
```javascript
// Instead of:
list.innerHTML = items.map(item => `<li>${item.name}</li>`).join('');

// Use:
const listItems = items.map(item => 
  this.dom.createElement('li', {}, item.name)
);
this.dom.replaceChildren(list, listItems);
```

### 3. Creating a Button with Icon
```javascript
// Instead of:
button.innerHTML = '<span class="icon">🚀</span> Analyze';

// Use:
const icon = this.dom.createElement('span', {
  className: 'icon'
}, '🚀');
const text = document.createTextNode(' Analyze');
this.dom.replaceChildren(button, [icon, text]);
```

### 4. Complex Card Component
```javascript
// Instead of:
container.innerHTML = `
  <div class="card">
    <div class="card-header">
      <h3>${title}</h3>
      <span class="badge">${count}</span>
    </div>
    <div class="card-body">
      <p>${description}</p>
    </div>
  </div>
`;

// Use:
const card = this.dom.createElementWithChildren('div', 
  { className: 'card' },
  [
    // Header
    this.dom.createElementWithChildren('div', 
      { className: 'card-header' },
      [
        this.dom.createElement('h3', {}, title),
        this.dom.createElement('span', { className: 'badge' }, count)
      ]
    ),
    // Body
    this.dom.createElementWithChildren('div',
      { className: 'card-body' },
      [this.dom.createElement('p', {}, description)]
    )
  ]
);
this.dom.replaceChildren(container, [card]);
```

### 5. Conditional Content
```javascript
// Instead of:
div.innerHTML = isError ? 
  `<span class="error">❌ ${message}</span>` : 
  `<span class="success">✅ ${message}</span>`;

// Use:
const span = this.dom.createElement('span', {
  className: isError ? 'error' : 'success'
}, `${isError ? '❌' : '✅'} ${message}`);
this.dom.replaceChildren(div, [span]);
```

### 6. Adding Styles
```javascript
// Multiple ways to add styles:

// 1. CSS string
const el1 = this.dom.createElement('div', {
  style: 'color: red; padding: 10px;'
});

// 2. Style object (preferred for dynamic styles)
const el2 = this.dom.createElement('div', {
  style: {
    color: 'red',
    padding: '10px',
    backgroundColor: '#f0f0f0'
  }
});

// 3. Individual style properties
const el3 = document.createElement('div');
el3.style.color = 'red';
el3.style.padding = '10px';
```

## Adding New Features - Step by Step

### Example: Adding a New Section to Show User Stats

```javascript
// 1. Create the method in overlay-manager-safe.js
showUserStats(stats) {
  // Find or create container
  let statsSection = document.getElementById('user-stats-section');
  if (!statsSection) {
    statsSection = this.dom.createElement('div', {
      id: 'user-stats-section',
      className: 'stats-section'
    });
    // Add to appropriate parent
    const content = document.querySelector('.overlay-content');
    if (content) content.appendChild(statsSection);
  }
  
  // Create stats cards
  const statsCards = Object.entries(stats).map(([key, value]) => {
    return this.dom.createElementWithChildren('div',
      { className: 'stat-card' },
      [
        this.dom.createElement('div', { className: 'stat-label' }, key),
        this.dom.createElement('div', { className: 'stat-value' }, value)
      ]
    );
  });
  
  // Create container with title
  const container = this.dom.createElementWithChildren('div',
    { style: 'margin: 16px 0;' },
    [
      this.dom.createElement('h4', {}, 'Profile Statistics'),
      this.dom.createElementWithChildren('div',
        { className: 'stats-grid' },
        statsCards
      )
    ]
  );
  
  // Update content
  this.dom.replaceChildren(statsSection, [container]);
  statsSection.classList.remove('hidden');
}
```

### Example: Adding a Progress Bar

```javascript
// Create progress bar element
createProgressBar(progress, label) {
  const container = this.dom.createElementWithChildren('div',
    { className: 'progress-container' },
    [
      // Label
      this.dom.createElement('div', {
        className: 'progress-label'
      }, `${label}: ${progress}%`),
      
      // Progress bar
      this.dom.createElementWithChildren('div',
        { className: 'progress-bar' },
        [
          this.dom.createElement('div', {
            className: 'progress-fill',
            style: `width: ${progress}%;`
          })
        ]
      )
    ]
  );
  
  return container;
}

// Use it
const progressBar = this.createProgressBar(75, 'Analysis Progress');
parentElement.appendChild(progressBar);
```

## Tips for Maintaining Safe DOM Code

1. **Always use the dom utilities**: They're built into overlay-manager-safe.js
2. **Never concatenate HTML strings**: Build elements individually
3. **Use fragments for performance**: When adding many elements
4. **Clear before adding**: Use `replaceChildren` to avoid duplicates
5. **Track event listeners**: Add them to the tracking array

## Memory Management

Always clean up when removing features:

```javascript
removeFeature() {
  // Remove event listeners
  if (this.featureListener) {
    element.removeEventListener('click', this.featureListener);
  }
  
  // Clear timers
  if (this.featureTimer) {
    clearTimeout(this.featureTimer);
  }
  
  // Remove DOM elements
  const feature = document.getElementById('my-feature');
  if (feature) feature.remove();
}
```

## Testing Your Changes

1. **Check for innerHTML**: Search your code for `innerHTML` or `insertAdjacentHTML`
2. **Verify cleanup**: Ensure all event listeners and timers are tracked
3. **Test memory**: Use Chrome DevTools to check for memory leaks
4. **Console errors**: Look for any security warnings

## Need Help?

When in doubt, look at existing patterns in:
- `/src/content/modules/ui/overlay-manager-safe.js`
- `/src/popup/popup-safe.js`
- `/src/common/dom-utils.js`

These files have many examples of safe DOM manipulation patterns.