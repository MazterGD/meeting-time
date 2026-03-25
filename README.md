# tzmeet

**Version**: 1.0.0

`tzmeet` is a premium, light-themed meeting timezone coordination tool designed for distributed teams. It helps team members find the perfect time to meet by visualizing working hours across different timezones.

## Features

- **Light Theme**: A clean, high-contrast interface designed for productivity.
- **Time Check**: Interactive slider to see what time it is for everyone on the team at a specific moment.
- **Find Overlap**: Heatmap visualization to identify the best time slots where everyone is within their core working hours.
- **Extended Working Hours**: Configured for 5 PM – 1 AM working hours, catering to specific team schedules.
- **Timezone Offsets**: Selection dropdown and teammate cards display UTC offsets (e.g., UTC+05:30) for quick reference.
- **Global UTC Display**: Persistent GMT 0 time indicator for a universal reference point.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- [npm](https://www.npmjs.com/)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd meeting-time
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running Locally

To start the development server:
```bash
npm run dev
```
The application will be available at `http://localhost:5173/` (or the next available port).

## How to Use

1.  **Add Team Members**: Click the "+ Add" button in the sidebar to add yourself and your teammates. Select their respective timezones from the searchable dropdown.
2.  **Toggle Views**:
    - **Time Check**: Use the slider to scrub through the 24-hour day. The status pills (Good, Okay, Night) will update for each member.
    - **Find Overlap**: View the daily heatmap to see "Ideal" (everyone in working hours) and "Acceptable" (reasonable hours for all) suggestions.
3.  **Adjust Date**: Use the date picker to check for specific days (accounts for DST changes).
4.  **Global Reference**: Refer to the "GMT 0" display next to the date for the universal meeting time.

## Data Persistence & Sharing

`tzmeet` uses two methods to preserve and share your team setup:

- **Automatic Saving**: Your team members are automatically saved to your browser's `localStorage`. They will be restored whenever you reopen the app in the same browser.
- **Save & Share**: Clicking the **"Share link"** button (top right) generates a unique URL containing all your current settings. You can save this link for future use or share it with others; the application will automatically restore the team configuration when the hashed URL is opened.
