(function () {
    const style = document.createElement('style');
    style.textContent = `
        .rental-assistant-launcher {
            position: fixed; right: 24px; bottom: 24px; z-index: 1000;
            width: 68px; height: 68px; padding: 0; border: 3px solid #fff;
            border-radius: 50%; background: #0756d8; cursor: pointer;
            box-shadow: 0 5px 20px rgba(20, 61, 130, .32);
            transition: transform .18s ease, box-shadow .18s ease;
        }
        .rental-assistant-launcher:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 24px rgba(20, 61, 130, .4);
        }
        .rental-assistant-launcher img {
            display: block; width: 100%; height: 100%; object-fit: cover;
            border-radius: 50%;
        }
        .rental-assistant-launcher:focus-visible,
        .rental-assistant-send:focus-visible,
        .rental-assistant-close:focus-visible,
        .rental-assistant-input:focus-visible {
            outline: 3px solid #7cc9f0; outline-offset: 3px;
        }
        .rental-assistant-panel {
            position: fixed; right: 24px; bottom: 104px; z-index: 1000;
            width: min(370px, calc(100vw - 32px)); height: min(500px, calc(100vh - 140px));
            min-height: 320px; display: flex; flex-direction: column;
            overflow: hidden; border: 1px solid #e2e8f0; border-radius: 18px;
            background: #fff; box-shadow: 0 12px 40px rgba(15, 39, 74, .22);
            font: 14px/1.45 'Segoe UI', Arial, sans-serif; color: #1e293b;
        }
        .rental-assistant-panel[hidden] { display: none; }
        .rental-assistant-header {
            display: flex; align-items: center; gap: 11px; padding: 13px 16px;
            background: linear-gradient(120deg, #0756d8, #218bd1); color: #fff;
        }
        .rental-assistant-header img {
            width: 42px; height: 42px; border: 2px solid rgba(255,255,255,.8);
            border-radius: 50%; object-fit: cover;
        }
        .rental-assistant-heading { flex: 1; min-width: 0; }
        .rental-assistant-heading strong { display: block; font-size: 15px; }
        .rental-assistant-heading span { font-size: 12px; opacity: .88; }
        .rental-assistant-close {
            border: 0; border-radius: 8px; padding: 6px 9px;
            background: rgba(255,255,255,.15); color: #fff; font-size: 21px;
            line-height: 1; cursor: pointer;
        }
        .rental-assistant-messages {
            flex: 1; display: flex; flex-direction: column; gap: 10px;
            overflow-y: auto; padding: 16px; background: #f7f9fc;
        }
        .rental-assistant-message {
            max-width: 88%; padding: 10px 12px; border-radius: 14px;
            white-space: pre-wrap; overflow-wrap: anywhere;
        }
        .rental-assistant-message.bot {
            align-self: flex-start; border: 1px solid #e5eaf1;
            border-bottom-left-radius: 4px; background: #fff;
        }
        .rental-assistant-message.user {
            align-self: flex-end; border-bottom-right-radius: 4px;
            background: #dceeff; color: #123d67;
        }
        .rental-assistant-suggestions {
            display: flex; flex-wrap: wrap; gap: 7px; padding: 0 14px 12px;
            background: #f7f9fc;
        }
        .rental-assistant-suggestion {
            padding: 6px 9px; border: 1px solid #c8dff1; border-radius: 20px;
            background: #fff; color: #17679f; font: inherit; font-size: 12px;
            cursor: pointer;
        }
        .rental-assistant-form {
            display: flex; gap: 8px; padding: 12px; border-top: 1px solid #e8edf3;
            background: #fff;
        }
        .rental-assistant-input {
            flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid #d7dee8;
            border-radius: 22px; font: inherit; color: #1e293b;
        }
        .rental-assistant-send {
            width: 42px; height: 42px; flex: 0 0 42px; border: 0;
            border-radius: 50%; background: #087ac1; color: #fff;
            font-size: 17px; cursor: pointer;
        }
        @media (max-width: 480px) {
            .rental-assistant-launcher { right: 16px; bottom: 16px; width: 60px; height: 60px; }
            .rental-assistant-panel {
                right: 12px; bottom: 88px; width: calc(100vw - 24px);
                height: min(500px, calc(100vh - 110px));
            }
        }
    `;
    document.head.appendChild(style);

    function getUserRole() {
        const storedUser = localStorage.getItem('userData');
        if (!storedUser) return 'unknown';

        try {
            const userData = JSON.parse(storedUser);
            if (!userData || typeof userData !== 'object') return 'unknown';
            const role = typeof userData.role === 'string' ? userData.role.trim().toLowerCase() : '';
            return role === 'landlord' || role === 'tenant' ? role : 'unknown';
        } catch (error) {
            console.error('Unable to read the rental assistant user role.', error);
            return 'unknown';
        }
    }

    const userRole = getUserRole();
    const badge = 'rental-assistant.png';
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'rental-assistant-launcher';
    launcher.setAttribute('aria-label', 'Open rental system help chat');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'rentalAssistantPanel');
    const launcherImage = document.createElement('img');
    launcherImage.src = badge;
    launcherImage.alt = '';
    launcher.appendChild(launcherImage);

    const panel = document.createElement('section');
    panel.className = 'rental-assistant-panel';
    panel.id = 'rentalAssistantPanel';
    panel.setAttribute('aria-label', 'Rental system help chat');
    panel.hidden = true;
    panel.innerHTML = `
        <header class="rental-assistant-header">
            <img src="${badge}" alt="">
            <div class="rental-assistant-heading">
                <strong>Rental Help Assistant</strong>
                <span>${userRole === 'unknown' ? 'Ask how to use the system' : `Personalized for ${userRole}s`}</span>
            </div>
            <button type="button" class="rental-assistant-close" aria-label="Close help chat">&times;</button>
        </header>
        <div class="rental-assistant-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
        <div class="rental-assistant-suggestions" aria-label="Suggested questions"></div>
        <form class="rental-assistant-form">
            <input class="rental-assistant-input" type="text" maxlength="500" autocomplete="off"
                placeholder="Type your question..." aria-label="Type your help question" required>
            <button class="rental-assistant-send" type="submit" aria-label="Send question">&#10148;</button>
        </form>
    `;
    document.body.append(launcher, panel);

    const messages = panel.querySelector('.rental-assistant-messages');
    const input = panel.querySelector('.rental-assistant-input');
    const form = panel.querySelector('.rental-assistant-form');
    const closeButton = panel.querySelector('.rental-assistant-close');
    const suggestions = panel.querySelector('.rental-assistant-suggestions');
    let welcomed = false;

    const suggestedQuestions = userRole === 'landlord'
        ? ['How do I add a room?', 'How do I review booking requests?', 'How do I review payments?']
        : userRole === 'tenant'
            ? ['How do I request to book a room?', 'How do I pay?', 'How do I request a room transfer?']
            : ['How do bookings work?', 'How do I pay?', 'Where can I find help?'];

    suggestedQuestions.forEach(question => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rental-assistant-suggestion';
        button.textContent = question;
        suggestions.appendChild(button);
    });

    function addMessage(text, sender) {
        const message = document.createElement('div');
        message.className = `rental-assistant-message ${sender}`;
        message.textContent = text;
        messages.appendChild(message);
        messages.scrollTop = messages.scrollHeight;
    }

    function answerQuestion(question) {
        const text = question.toLowerCase();
        if (/\b(hello|hi|hey|good morning|good afternoon)\b/.test(text)) {
            const roleGreeting = userRole === 'landlord'
                ? 'I can help you manage rooms, tenants, booking requests, and payments.'
                : userRole === 'tenant'
                    ? 'I can help you request a booking, submit payments, and track your requests.'
                    : 'I can help with rooms, bookings, payments, and dashboard navigation.';
            return `Hello! ${roleGreeting} What would you like help with?`;
        }
        if (/\b(move.?out|room transfer|transfer|request status|request history|my requests?|check (?:on )?(?:my )?requests?|requests? update)\b/.test(text)) {
            if (userRole === 'tenant') {
                return 'Open your Dashboard and use New Request to submit a move-out or room-transfer request with a preferred date and reason. Use Request History on the same page to check its status.';
            }
            if (userRole === 'landlord') {
                return 'Open your Dashboard and review the Move-Out / Room Transfer Requests section. Open a request to review its details, then approve or reject it.';
            }
            return 'Tenants can submit move-out or room-transfer requests from Dashboard > New Request and check Dashboard > Request History. Landlords can review these in the Dashboard request section.';
        }
        if (/\b(message|messages|contact|inbox|send (?:a )?message)\b/.test(text)) {
            return 'Open Messages from the Dashboard to send a message or review your inbox. Choose the send or inbox area and follow the on-screen fields.';
        }
        if (/\b(tenant page|tenant records?|manage tenants?|add (?:a |new )?tenants?|edit (?:a )?tenant|remove (?:a )?tenant|delete (?:a )?tenant|tenant list|resident records?)\b/.test(text)) {
            if (userRole === 'landlord') {
                return 'Open Tenants from the sidebar to review tenant records. Use the page search and filters to find a tenant, then use the available row actions to manage the record.';
            }
            if (userRole === 'tenant') {
                return 'The Tenants page is for landlord-managed tenant records and is not part of the tenant workflow. For your own rental details or account information, check your Dashboard or Settings, or message your landlord.';
            }
            return 'Landlords can review tenant records from Tenants in the sidebar. Tenants can check their own rental details on the Dashboard or contact their landlord.';
        }
        if (/\b(book|booking|bookings|reservation|request to book|booking request)\b/.test(text)) {
            if (userRole === 'tenant') {
                return 'To request a room, open its advertisement and choose Request to Book. You can review your booking requests in Bookings; only pending requests can be cancelled.';
            }
            if (userRole === 'landlord') {
                return 'Open Bookings from the sidebar to review incoming requests. Use the status filters, then open a pending request to accept or reject it.';
            }
            return 'Tenants can request a room from its advertisement using Request to Book and track requests in Bookings. Landlords review and accept or reject requests from Bookings.';
        }
        if (/\b(pay|payment|payments|receipt|receipts|billing|gcash|bank)\b/.test(text)) {
            if (userRole === 'landlord') {
                return 'Open Payment from the sidebar, select a tenant, and review their billing and submitted receipts. Verify a receipt before accepting it.';
            }
            if (userRole === 'tenant') {
                return 'Open Payment from the sidebar, review the payment instructions and outstanding billing for your rental, then submit your payment receipt there. Keep a copy for your records.';
            }
            return 'Tenants can review their billing and submit receipts from Payment. Landlords can select a tenant there to review billing and submitted receipts.';
        }
        if (/\b(room|rooms|unit|units|available|availability)\b/.test(text)) {
            if (userRole === 'landlord') {
                return 'Open Room Details from the sidebar and choose + Add Room to create a unit. Select an existing room to review or update its details and availability.';
            }
            if (userRole === 'tenant') {
                return 'To find a room to rent, browse the room advertisements and open one to see its details and availability. Choose Request to Book to contact the landlord about an available room. For your current room, contact your landlord through Messages.';
            }
            return 'Landlords can add or update units in Room Details. Tenants can browse room advertisements and choose Request to Book for an available room.';
        }
        if (/\b(dashboard|overview|statistics|stats|revenue)\b/.test(text)) {
            if (userRole === 'landlord') {
                return 'Your Dashboard summarizes rental activity and includes the Move-Out / Room Transfer Requests section. Use the sidebar to manage tenants, rooms, bookings, and payments.';
            }
            if (userRole === 'tenant') {
                return 'Your Dashboard is where you can submit move-out or room-transfer requests, check Request History, and read messages from your landlord. Use the sidebar for Bookings, Payment, and Settings.';
            }
            return 'The Dashboard shows role-specific rental activity and requests. Use the sidebar to open the pages available to your account.';
        }
        if (/\b(help|what can you|how does this system work)\b/.test(text)) {
            if (userRole === 'landlord') {
                return 'I can guide you through adding rooms, managing tenant records, reviewing booking requests, processing payment receipts, and handling move-out or room-transfer requests. Ask about a specific task or page.';
            }
            if (userRole === 'tenant') {
                return 'I can guide you through requesting a room, submitting payments, messaging your landlord, and tracking move-out or room-transfer requests. Ask about a specific task or page.';
            }
            return 'I can guide landlords through room and tenant management, bookings, and payment reviews, and tenants through booking requests, payments, and request history. Tell me your role to get tailored steps.';
        }
        if (/\b(navigate|menu|sidebar|where|find|open)\b/.test(text)) {
            if (userRole === 'landlord') {
                return 'Use the left sidebar to open Dashboard, Tenants, Room Details, Bookings, Payment, or Settings. On smaller screens, expand the menu to see the labels.';
            }
            if (userRole === 'tenant') {
                return 'Use the left sidebar to open Dashboard, Bookings, Payment, or Settings. On smaller screens, expand the menu to see the labels.';
            }
            return 'Use the left sidebar to open the pages available to your account. On smaller screens, expand the menu to see the labels.';
        }
        if (userRole === 'landlord') {
            return 'I can help you add rooms, manage tenant records, review booking requests and payments, and handle tenant requests. Try asking about a specific task or page.';
        }
        if (userRole === 'tenant') {
            return 'I can help you request a room, submit payments, contact your landlord, and track your requests. Try asking about a specific task or page.';
        }
        return 'I can help with booking requests, payments, rooms, and dashboard navigation. Tell me whether you are a landlord or tenant so I can give the right steps.';
    }

    function submitQuestion(question) {
        const trimmed = question.trim();
        if (!trimmed) return;
        addMessage(trimmed, 'user');
        addMessage(answerQuestion(trimmed), 'bot');
    }

    launcher.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        launcher.setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) {
            if (!welcomed) {
                const welcome = userRole === 'landlord'
                    ? 'Hi! I’m your rental system assistant. I can guide you through managing rooms, tenants, bookings, and payments.'
                    : userRole === 'tenant'
                        ? 'Hi! I’m your rental system assistant. I can guide you through booking a room, payments, and tracking your requests.'
                        : 'Hi! I’m your rental system assistant. Tell me whether you are a landlord or tenant, and ask how to use a page or complete a task.';
                addMessage(welcome, 'bot');
                welcomed = true;
            }
            input.focus();
        }
    });
    closeButton.addEventListener('click', () => {
        panel.hidden = true;
        launcher.setAttribute('aria-expanded', 'false');
        launcher.focus();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        submitQuestion(input.value);
        input.value = '';
        input.focus();
    });
    panel.querySelectorAll('.rental-assistant-suggestion').forEach(button => {
        button.addEventListener('click', () => submitQuestion(button.textContent));
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !panel.hidden) {
            panel.hidden = true;
            launcher.setAttribute('aria-expanded', 'false');
            launcher.focus();
        }
    });
})();
