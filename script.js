// =========================================================
// A. 1. CONFIGURACIÓN DE FIREBASE (¡REEMPLAZA ESTO CON TUS CLAVES REALES!)
// =========================================================

const firebaseConfig = {
    apiKey: "AIzaSyD_3G97nMH91Cin7rvkMr5FZ5C76NLDCY0", // <--- PEGA TU apiKey REAL
    authDomain: "monopoliobank.firebaseapp.com", // <--- PEGA TU authDomain REAL
    projectId: "monopoliobank", // <--- PEGA TU projectId REAL
    storageBucket: "monopoliobank.firebasestorage.app", // <--- PEGA TU storageBucket REAL
    messagingSenderId: "918026032724", // <--- PEGA TU messagingSenderId REAL
    appId: "1:918026032724:web:7d63bda8bba719cd02ffc1" // <--- PEGA TU appId REAL
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =========================================================
// 2. VARIABLES GLOBALES (accesibles fuera del listener DOMContentLoaded)
// =========================================================
let CURRENT_PLAYER_ID = null; 
const SALARY_AMOUNT = 200;
const INITIAL_BALANCE = 1500; 
let allPlayersCache = []; 
let selectedPlayerForLogin = { id: null, name: null }; 


// =========================================================
// CÓDIGO PRINCIPAL: ASEGURAR QUE EL DOM ESTÉ CARGADO
// =========================================================

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // 3. CACHÉ DE ELEMENTOS DEL DOM (SOLO DENTRO DEL LISTENER)
    // =========================================================
    
    // Elementos de la interfaz dinámica 
    const dynamicActionArea = document.getElementById('dynamic-action-area');
    const actionTitle = document.getElementById('action-title');
    const amountInput = document.getElementById('dynamic-amount-input');
    const executeButton = document.getElementById('execute-action-button');
    const statusMessage = document.getElementById('status-message');

    // Elementos de la interfaz de PIN
    const pinEntryArea = document.getElementById('pin-entry-area');
    const pinTitle = document.getElementById('pin-title');
    const pinInput = document.getElementById('pin-input');
    const submitPinButton = document.getElementById('submit-pin-button');
    const pinStatusMessage = document.getElementById('pin-status-message');
    
    // Botones globales
    const logoutButton = document.getElementById('logout-button');
    const resetButton = document.getElementById('reset-game-button');
    const backButton = document.getElementById('back-to-player-select-button');
    const salaryButton = document.getElementById('salary-button');
    const bankReceiveButton = document.getElementById('bank-receive-button');


    // =========================================================
    // 4. FUNCIONES ASÍNCRONAS Y DE UTILERÍA
    // =========================================================

    async function fetchAllPlayers() {
        const snapshot = await db.collection("players").get();
        allPlayersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return allPlayersCache;
    }
    
    function generateTwoDigitPin() {
        return String(Math.floor(10 + Math.random() * 90)); // Genera un número entre 10 y 99
    }
    
    // Función de Transacción y Reinicio (se mantiene igual)
    async function performTransaction(senderId, recipientId, amount) {
        if (amount <= 0) return alert("El monto debe ser positivo.");

        const senderRef = db.collection('players').doc(senderId);
        const recipientRef = db.collection('players').doc(recipientId);

        executeButton.disabled = true; 

        try {
            await db.runTransaction(async (transaction) => {
                
                const senderDoc = await transaction.get(senderRef);
                const recipientDoc = await transaction.get(recipientRef);
                
                if (senderId === CURRENT_PLAYER_ID) { 
                    if (senderDoc.data().balance < amount) {
                        throw "Saldo insuficiente.";
                    }
                }
                if (!recipientDoc.exists) {
                     throw "El jugador que recibe no existe.";
                }

                if (senderId !== 'bank') {
                    const newSenderBalance = senderDoc.data().balance - amount;
                    transaction.update(senderRef, { balance: newSenderBalance });
                }

                const newRecipientBalance = recipientDoc.data().balance + amount;
                transaction.update(recipientRef, { balance: newRecipientBalance });
                
                db.collection("transactions").add({
                    sender: senderId,
                    recipient: recipientId,
                    amount: amount,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            console.log("Transacción completada con éxito.");

        } catch (e) {
            console.error("Fallo de Transacción:", e);
            if (e === "Saldo insuficiente.") {
                 alert(e);
            } else {
                 alert(`Error en la transacción: ${e.message || e}`);
            }
           
        } finally {
            executeButton.disabled = false; 
        }
    }

    async function resetGame() {
        if (!confirm("ADVERTENCIA: ¿Estás seguro de que quieres REINICIAR el juego? Se borrarán todas las transacciones, los saldos volverán a $1500, y los PINs de seguridad se resetearán para que se genere uno nuevo de 2 dígitos al siguiente login.")) {
            return;
        }
        
        try {
            const playersSnapshot = await db.collection('players').get();
            const batch = db.batch();
            
            // 1. Resetear saldos y PINs a '00' (marcador para regenerar)
            playersSnapshot.forEach(doc => {
                const playerRef = db.collection('players').doc(doc.id);
                if (doc.id !== 'bank') {
                    batch.update(playerRef, { balance: INITIAL_BALANCE, pin: '00' }); 
                } else {
                     batch.update(playerRef, { balance: 0 });
                }
            });

            // 2. Eliminar todas las transacciones
            const transactionsSnapshot = await db.collection('transactions').get();
            transactionsSnapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            alert("¡Juego Reiniciado con éxito! Saldos a $1500. El PIN se generará en el próximo inicio de sesión de cada jugador.");
            
            CURRENT_PLAYER_ID = null;
            document.getElementById('main-app').style.display = 'none';
            document.getElementById('login-screen').style.display = 'block';

        } catch (error) {
            console.error("Error al reiniciar el juego:", error);
            alert("Hubo un error al intentar reiniciar el juego. Revisa la consola.");
        }
    }


    // =========================================================
    // 5. LISTENERS EN TIEMPO REAL (Lógica de Actualización de UI)
    // =========================================================

    function startAppListeners() {
        // Escucha en tiempo real los cambios en la colección de jugadores (Saldo y PIN)
        db.collection("players").onSnapshot((snapshot) => {
            allPlayersCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            let currentPlayerBalance = 0;
            let currentPlayerName = '';
            let currentPlayerPin = '--'; 
            
            const currentPlayer = allPlayersCache.find(p => p.id === CURRENT_PLAYER_ID);
            if (currentPlayer) {
                currentPlayerBalance = currentPlayer.balance;
                currentPlayerName = currentPlayer.name;
                currentPlayerPin = currentPlayer.pin; 
            }

            // Mostrar datos en la cabecera
            document.getElementById('current-player-name').textContent = 'Jugador: ' + currentPlayerName;
            document.getElementById('current-balance').textContent = `$${currentPlayerBalance.toLocaleString('es-ES')}`;
            // Ajuste aquí: Asegurar que el PIN visible en la UI use el mismo tamaño y color verde que definiste en CSS
            document.getElementById('current-pin').textContent = currentPlayerPin; 
        });

        // Escucha en tiempo real el historial de transacciones (TRANSACCIONES GLOBALES)
        db.collection("transactions").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
            const list = document.getElementById('transactions-list');
            list.innerHTML = ''; 
            
            const playerNames = allPlayersCache.reduce((acc, p) => {
                acc[p.id] = p.name;
                return acc;
            }, {});

            snapshot.forEach((doc) => {
                const data = doc.data();
                const item = document.createElement('div');
                item.classList.add('transaction-item');

                let amountText = '';
                let amountClass = '';
                
                const senderName = playerNames[data.sender] || data.sender;
                const recipientName = playerNames[data.recipient] || data.recipient;
                
                const description = `${senderName} pagó a ${recipientName}`;
                
                let isCurrentPlayerInvolved = false;

                // Lógica para el énfasis (color del monto y negrita de toda la fila)
                if (data.sender === CURRENT_PLAYER_ID) {
                    // El jugador actual PAGÓ (Negativo - Rojo)
                    amountText = `-$${data.amount.toLocaleString('es-ES')}`;
                    amountClass = 'negative';
                    isCurrentPlayerInvolved = true;
                } else if (data.recipient === CURRENT_PLAYER_ID) {
                    // El jugador actual RECIBIÓ (Positivo - Verde)
                    amountText = `+$${data.amount.toLocaleString('es-ES')}`;
                    amountClass = 'positive';
                    isCurrentPlayerInvolved = true;
                } else {
                    // Transacción entre terceros (Normal)
                    amountText = `$${data.amount.toLocaleString('es-ES')}`;
                    amountClass = ''; 
                }
                
                if (isCurrentPlayerInvolved) {
                    item.classList.add('highlight-transaction'); // Negrita a toda la fila
                }
                
                const time = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit'}) : '...';

                item.innerHTML = `
                    <div>${description}</div>
                    <div class="amount ${amountClass}">${amountText} (${time})</div>
                `;
                list.appendChild(item);
            });
        });
    }

    // Actualizar botones de pago (jugadores excepto el actual)
    function updatePayButtons() {
        const payGrid = document.querySelector('.pay-buttons-grid');
        payGrid.innerHTML = ''; 

        const targets = allPlayersCache.filter(p => 
            p.id !== CURRENT_PLAYER_ID && p.id !== 'bank' 
        );
        
        targets.forEach(p => {
            const button = document.createElement('button');
            button.classList.add('player-button', 'pay-select-button');
            button.setAttribute('data-player-id', p.id);
            button.setAttribute('data-player-name', p.name);
            button.textContent = p.name;
            payGrid.appendChild(button);
        });

        const bankButton = document.createElement('button');
        bankButton.classList.add('player-button', 'pay-select-button');
        bankButton.setAttribute('data-player-id', 'bank');
        bankButton.setAttribute('data-player-name', 'BANCO');
        bankButton.textContent = 'BANCO';
        payGrid.appendChild(bankButton);
        
        document.querySelectorAll('.pay-select-button').forEach(button => {
            button.addEventListener('click', paySelectHandler);
        });
    }
    
    function resetDynamicArea() {
        dynamicActionArea.style.display = 'none';
        amountInput.value = '';
        statusMessage.textContent = '';
        currentAction = { type: null, targetId: null, targetName: null };
    }

    // =========================================================
    // 6. EVENTOS (ASIGNACIÓN)
    // =========================================================

    // A. LOGIN: Selección de Jugador (CORREGIDO)
    document.querySelectorAll('.login-button').forEach(button => {
        button.addEventListener('click', async (e) => {
            const playerId = button.getAttribute('data-player-id');
            const playerName = button.textContent;

            const players = await fetchAllPlayers(); 
            const player = players.find(p => p.id === playerId);
            
            document.querySelector('.login-grid').style.display = 'none';
            selectedPlayerForLogin = { id: playerId, name: playerName };
            pinEntryArea.style.display = 'flex'; // <--- El error ocurría justo después de esta línea
            
            // 1. GENERAR PIN SI NO EXISTE ('00' o null)
            if (!player || player.pin === '00' || !player.pin) {
                
                const newPin = generateTwoDigitPin();
                // Actualizamos el PIN en Firebase
                await db.collection('players').doc(playerId).update({ pin: newPin });
                
                pinTitle.textContent = `¡TU NUEVO PIN es ${newPin}! Memorízalo.`;
                pinStatusMessage.innerHTML = `<span style="color: ${getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim()}; font-size: 1.1em;">Este es tu PIN de acceso: <b>${newPin}</b></span>`;
                
                pinInput.type = 'text'; 
                pinInput.value = newPin; 
                pinInput.disabled = true;
                submitPinButton.style.display = 'none'; 
                
                // Forzar re-ingreso después de 3 segundos
                setTimeout(() => {
                    pinTitle.textContent = `Ingresar PIN para ${playerName}`;
                    pinStatusMessage.textContent = `Ingresa el PIN de 2 dígitos.`; 
                    pinInput.type = 'password';
                    pinInput.value = '';
                    pinInput.disabled = false;
                    submitPinButton.style.display = 'inline-block';
                    pinInput.focus();
                }, 3000); 

            } else {
                // PIN EXISTENTE: Preparar para el ingreso normal
                pinTitle.textContent = `Ingresar PIN para ${playerName}`;
                pinStatusMessage.textContent = `Ingresa el PIN de 2 dígitos.`; 
                pinInput.type = 'password';
                pinInput.value = ''; 
                pinInput.disabled = false;
                submitPinButton.style.display = 'inline-block'; 
                pinInput.focus();
            }
        }); // <-- CIERRE DE LA FUNCIÓN DE EVENTO DEL BOTÓN DE LOGIN
    }); // <-- CIERRE DEL FOREACH

    // B. LOGIN: Enviar PIN 
    submitPinButton.addEventListener('click', async () => {
        const enteredPin = pinInput.value;
        const playerId = selectedPlayerForLogin.id;

        if (enteredPin.length !== 2) {
            pinStatusMessage.textContent = "El PIN debe ser de 2 dígitos.";
            return;
        }

        const players = await fetchAllPlayers(); 
        const player = players.find(p => p.id === playerId);
        
        if (player && player.pin === enteredPin) { 
            
            CURRENT_PLAYER_ID = playerId;
            
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('main-app').style.display = 'block';

            startAppListeners(); 
            updatePayButtons(); 
            
            pinEntryArea.style.display = 'none';
            document.querySelector('.login-grid').style.display = 'grid';

        } else {
            pinStatusMessage.textContent = "PIN incorrecto. Intenta de nuevo.";
            pinInput.value = '';
        }
    });

    // C. LOGIN: Volver a la selección de jugador
    backButton.addEventListener('click', () => {
        pinEntryArea.style.display = 'none';
        document.querySelector('.login-grid').style.display = 'grid';
        selectedPlayerForLogin = { id: null, name: null };
        pinInput.value = '';
        pinStatusMessage.textContent = '';
        
        // Resetear el input a su estado normal 
        pinInput.type = 'password';
        pinInput.disabled = false;
        submitPinButton.style.display = 'inline-block'; 
    });


    // D. ACCIÓN: Seleccionar Pago
    const paySelectHandler = (e) => {
        if (!CURRENT_PLAYER_ID) return;
        resetDynamicArea();
        
        const targetId = e.currentTarget.getAttribute('data-player-id');
        const targetName = e.currentTarget.getAttribute('data-player-name');
        
        currentAction = {
            type: 'PAY',
            targetId: targetId,
            targetName: targetName
        };

        actionTitle.textContent = `Pagar a: ${targetName}`;
        dynamicActionArea.style.display = 'flex';
        executeButton.textContent = 'PAGAR';
        amountInput.placeholder = 'Monto a pagar';
        amountInput.focus();
    };
    
    // E. ACCIÓN: Recibir del Banco (Monto variable)
    bankReceiveButton.addEventListener('click', () => {
        if (!CURRENT_PLAYER_ID) return;
        resetDynamicArea();

        currentAction = {
            type: 'RECEIVE_FROM_BANK',
            targetId: 'bank',
            targetName: 'Banco'
        };

        actionTitle.textContent = `Recibir de: Banco`;
        dynamicActionArea.style.display = 'flex';
        executeButton.textContent = 'RECIBIR';
        amountInput.placeholder = 'Monto a recibir';
        amountInput.focus();
    });

    // F. ACCIÓN: Ejecutar Transacción (Pagar/Recibir)
    executeButton.addEventListener('click', () => {
        if (!CURRENT_PLAYER_ID) return;

        const amount = parseFloat(amountInput.value);
        
        statusMessage.textContent = ''; 

        if (amount <= 0 || isNaN(amount)) {
            statusMessage.textContent = "¡Ingresa un monto válido y mayor a 0!";
            return;
        }

        if (currentAction.type === 'PAY') {
            performTransaction(CURRENT_PLAYER_ID, currentAction.targetId, amount);
        } else if (currentAction.type === 'RECEIVE_FROM_BANK') {
            performTransaction('bank', CURRENT_PLAYER_ID, amount); 
        }
        
        resetDynamicArea();
    });

    // G. ACCIÓN: Salario ($200 fijo)
    salaryButton.addEventListener('click', () => {
        if (!CURRENT_PLAYER_ID) return;
        const amount = SALARY_AMOUNT;
        
        if (confirm(`¿Seguro que quieres cobrar el Salario ($${amount})?`)) {
            performTransaction('bank', CURRENT_PLAYER_ID, amount);
        }
        resetDynamicArea(); 
    });

    // H. UTILIDAD: Reiniciar Juego 
    resetButton.addEventListener('click', () => {
        resetGame();
    });

    // I. UTILIDAD: Cerrar Sesión (Ahora es el botón "INICIO")
    logoutButton.addEventListener('click', () => {
        CURRENT_PLAYER_ID = null;
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('login-screen').style.display = 'block';
        resetDynamicArea();
        pinEntryArea.style.display = 'none';
        document.querySelector('.login-grid').style.display = 'grid';
    });

    // J. INICIALIZACIÓN
    fetchAllPlayers();
}); // <-- CIERRE DEL DOMContentLoaded FINAL