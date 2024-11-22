// Binance API Configuration
const BINANCE_API = 'https://api.binance.com/api/v3';
let chart;
let candlestickSeries;
let alertCount = 0;
let allSymbols = [];
let currentSymbol = 'BTCUSDT';

// Initialize the chart
function initChart() {
    const chartProperties = {
        width: document.getElementById('chart').clientWidth,
        height: 400,
        layout: {
            background: { color: '#1e1e1e' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
            horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
        },
        timeScale: {
            timeVisible: true,
            secondsVisible: false,
        },
    };

    chart = LightweightCharts.createChart(document.getElementById('chart'), chartProperties);
    candlestickSeries = chart.addCandlestickSeries();
}

// Fetch all trading pairs from Binance
async function fetchAllSymbols() {
    try {
        const response = await fetch(`${BINANCE_API}/exchangeInfo`);
        const data = await response.json();
        allSymbols = data.symbols
            .filter(symbol => symbol.status === 'TRADING')
            .map(symbol => ({
                symbol: symbol.symbol,
                baseAsset: symbol.baseAsset,
                quoteAsset: symbol.quoteAsset,
                price: 0,
                volume: 0
            }));
        
        // Get 24hr ticker for all symbols
        const tickerResponse = await fetch(`${BINANCE_API}/ticker/24hr`);
        const tickerData = await tickerResponse.json();
        
        // Update prices and volumes
        allSymbols = allSymbols.map(symbol => {
            const ticker = tickerData.find(t => t.symbol === symbol.symbol);
            return {
                ...symbol,
                price: ticker ? parseFloat(ticker.lastPrice) : 0,
                volume: ticker ? parseFloat(ticker.volume) : 0
            };
        });

        document.getElementById('symbolCount').textContent = 
            allSymbols.length.toString().replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
            
        updateSymbolsList();
    } catch (error) {
        console.error('Error fetching symbols:', error);
    }
}

// Filter symbols based on user criteria
function filterSymbols() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const priceOp = document.getElementById('priceOperator').value;
    const priceVal = parseFloat(document.getElementById('priceValue').value) || 0;
    const volumeOp = document.getElementById('volumeOperator').value;
    const volumeVal = parseFloat(document.getElementById('volumeValue').value) || 0;
    const quoteAsset = document.getElementById('quoteAsset').value;

    return allSymbols.filter(symbol => {
        // Search term filter
        const matchesSearch = 
            symbol.symbol.toLowerCase().includes(searchTerm) ||
            symbol.baseAsset.toLowerCase().includes(searchTerm) ||
            symbol.quoteAsset.toLowerCase().includes(searchTerm);

        // Quote asset filter
        const matchesQuote = quoteAsset === 'all' || symbol.quoteAsset === quoteAsset;

        // Price filter
        let matchesPrice = true;
        if (priceVal > 0) {
            switch (priceOp) {
                case 'eq': matchesPrice = symbol.price === priceVal; break;
                case 'gt': matchesPrice = symbol.price > priceVal; break;
                case 'lt': matchesPrice = symbol.price < priceVal; break;
                case 'gte': matchesPrice = symbol.price >= priceVal; break;
                case 'lte': matchesPrice = symbol.price <= priceVal; break;
            }
        }

        // Volume filter
        let matchesVolume = true;
        if (volumeVal > 0) {
            switch (volumeOp) {
                case 'eq': matchesVolume = symbol.volume === volumeVal; break;
                case 'gt': matchesVolume = symbol.volume > volumeVal; break;
                case 'lt': matchesVolume = symbol.volume < volumeVal; break;
                case 'gte': matchesVolume = symbol.volume >= volumeVal; break;
                case 'lte': matchesVolume = symbol.volume <= volumeVal; break;
            }
        }

        return matchesSearch && matchesQuote && matchesPrice && matchesVolume;
    });
}

// Update symbols list in UI
function updateSymbolsList() {
    const filteredSymbols = filterSymbols();
    const symbolsList = document.getElementById('symbolsList');
    symbolsList.innerHTML = '';

    filteredSymbols.forEach(symbol => {
        const div = document.createElement('div');
        div.className = `symbol-item ${symbol.symbol === currentSymbol ? 'selected' : ''}`;
        div.textContent = symbol.symbol;
        div.onclick = () => {
            currentSymbol = symbol.symbol;
            updateSymbolsList();
            updateChart();
        };
        symbolsList.appendChild(div);
    });
}

// Fetch candle data from Binance
async function fetchCandleData(symbol, interval) {
    try {
        const response = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=${interval}&limit=100`);
        const data = await response.json();
        return data.map(d => ({
            time: d[0] / 1000,
            open: parseFloat(d[1]),
            high: parseFloat(d[2]),
            low: parseFloat(d[3]),
            close: parseFloat(d[4]),
            volume: parseFloat(d[5])
        }));
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

// Analyze candles for long tails
function analyzeTails(candle, tailRatio) {
    const upperTail = candle.high - Math.max(candle.open, candle.close);
    const lowerTail = Math.min(candle.open, candle.close) - candle.low;
    const candleLength = candle.high - candle.low;
    
    if (candleLength === 0) return null;
    
    const upperTailRatio = (upperTail / candleLength) * 100;
    const lowerTailRatio = (lowerTail / candleLength) * 100;
    
    if (upperTailRatio > tailRatio) {
        return { type: 'sell', ratio: upperTailRatio.toFixed(2) };
    } else if (lowerTailRatio > tailRatio) {
        return { type: 'buy', ratio: lowerTailRatio.toFixed(2) };
    }
    
    return null;
}

// Add alert to the list
function addAlert(symbol, type, ratio, time) {
    const alertsList = document.getElementById('alertsList');
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    
    const timeString = new Date(time * 1000).toLocaleTimeString('ar-SA');
    const direction = type === 'buy' ? 'شراء' : 'بيع';
    const arabicRatio = ratio.replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
    
    alert.innerHTML = `
        <strong>${symbol}</strong> - إشارة ${direction}
        <br>
        نسبة الذيل: ${arabicRatio}٪
        <br>
        الوقت: ${timeString}
    `;
    
    alertsList.insertBefore(alert, alertsList.firstChild);
    alertCount++;
    document.getElementById('alertCount').textContent = 
        alertCount.toString().replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

// Update chart and analyze data
async function updateChart() {
    const interval = document.getElementById('timeframe').value;
    const tailRatio = parseFloat(document.getElementById('tailRatio').value);
    
    const candleData = await fetchCandleData(currentSymbol, interval);
    candlestickSeries.setData(candleData);
    
    // Analyze latest candle
    const latestCandle = candleData[candleData.length - 1];
    const analysis = analyzeTails(latestCandle, tailRatio);
    
    if (analysis) {
        addAlert(currentSymbol, analysis.type, analysis.ratio, latestCandle.time);
    }
    
    document.getElementById('lastUpdate').textContent = 
        new Date().toLocaleTimeString('ar-SA');
}

// Initialize the application
window.onload = async () => {
    initChart();
    await fetchAllSymbols();
    updateChart();
    
    // Update every 10 seconds
    setInterval(async () => {
        await fetchAllSymbols();
        updateChart();
    }, 10000);
    
    // Event listeners
    document.getElementById('searchInput').addEventListener('input', updateSymbolsList);
    document.getElementById('priceOperator').addEventListener('change', updateSymbolsList);
    document.getElementById('priceValue').addEventListener('input', updateSymbolsList);
    document.getElementById('volumeOperator').addEventListener('change', updateSymbolsList);
    document.getElementById('volumeValue').addEventListener('input', updateSymbolsList);
    document.getElementById('quoteAsset').addEventListener('change', updateSymbolsList);
    document.getElementById('timeframe').addEventListener('change', updateChart);
    document.getElementById('tailRatio').addEventListener('change', updateChart);
    
    // Handle window resize
    window.addEventListener('resize', () => {
        chart.applyOptions({
            width: document.getElementById('chart').clientWidth
        });
    });
};