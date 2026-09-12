# TERMINAL ANDROID - Native App Architecture

---

## 1. PROJECT STRUCTURE

```
terminal-android/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/saasplatform/terminal/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── di/ (Dependency Injection)
│   │   │   │   │   ├── AppModule.kt
│   │   │   │   │   ├── NetworkModule.kt
│   │   │   │   │   └── RepositoryModule.kt
│   │   │   │   │
│   │   │   │   ├── data/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   ├── GraphQLClient.kt
│   │   │   │   │   │   └── AuthInterceptor.kt
│   │   │   │   │   ├── repository/
│   │   │   │   │   │   ├── AuthRepository.kt
│   │   │   │   │   │   ├── OrderRepository.kt
│   │   │   │   │   │   ├── DeviceRepository.kt
│   │   │   │   │   │   └── PrinterRepository.kt
│   │   │   │   │   ├── local/
│   │   │   │   │   │   ├── SharedPreferencesManager.kt
│   │   │   │   │   │   └── TokenManager.kt
│   │   │   │   │   └── model/
│   │   │   │   │       ├── Order.kt
│   │   │   │   │       ├── Device.kt
│   │   │   │   │       ├── User.kt
│   │   │   │   │       └── ...
│   │   │   │   │
│   │   │   │   ├── domain/
│   │   │   │   │   ├── usecase/
│   │   │   │   │   │   ├── LoginUseCase.kt
│   │   │   │   │   │   ├── GetOrdersUseCase.kt
│   │   │   │   │   │   ├── UpdateOrderStatusUseCase.kt
│   │   │   │   │   │   ├── PrintOrderUseCase.kt
│   │   │   │   │   │   └── RegisterDeviceUseCase.kt
│   │   │   │   │   └── model/
│   │   │   │   │       └── Domain models
│   │   │   │   │
│   │   │   │   ├── presentation/
│   │   │   │   │   ├── auth/
│   │   │   │   │   │   ├── LoginActivity.kt
│   │   │   │   │   │   ├── LoginViewModel.kt
│   │   │   │   │   │   └── LoginUI.kt
│   │   │   │   │   ├── orders/
│   │   │   │   │   │   ├── OrdersFragment.kt
│   │   │   │   │   │   ├── OrdersViewModel.kt
│   │   │   │   │   │   ├── OrderDetailFragment.kt
│   │   │   │   │   │   ├── OrderDetailViewModel.kt
│   │   │   │   │   │   └── OrderAdapter.kt
│   │   │   │   │   ├── settings/
│   │   │   │   │   │   ├── SettingsFragment.kt
│   │   │   │   │   │   ├── SettingsViewModel.kt
│   │   │   │   │   │   ├── PrinterSetupFragment.kt
│   │   │   │   │   │   └── PrinterSetupViewModel.kt
│   │   │   │   │   ├── common/
│   │   │   │   │   │   ├── BaseActivity.kt
│   │   │   │   │   │   ├── BaseFragment.kt
│   │   │   │   │   │   ├── BaseViewModel.kt
│   │   │   │   │   │   ├── ViewState.kt
│   │   │   │   │   │   └── Navigation.kt
│   │   │   │   │   └── components/
│   │   │   │   │       ├── OrderCard.kt
│   │   │   │   │       ├── StatusBadge.kt
│   │   │   │   │       └── LoadingDialog.kt
│   │   │   │   │
│   │   │   │   ├── services/
│   │   │   │   │   ├── AuthService.kt
│   │   │   │   │   ├── OrderService.kt
│   │   │   │   │   ├── PrintService.kt
│   │   │   │   │   ├── PrinterDiscoveryService.kt
│   │   │   │   │   ├── NotificationService.kt
│   │   │   │   │   └── DeviceService.kt
│   │   │   │   │
│   │   │   │   ├── utils/
│   │   │   │   │   ├── ESCPOSFormatter.kt
│   │   │   │   │   ├── DateFormatter.kt
│   │   │   │   │   ├── CurrencyFormatter.kt
│   │   │   │   │   ├── Logger.kt
│   │   │   │   │   └── Constants.kt
│   │   │   │   │
│   │   │   │   ├── network/
│   │   │   │   │   ├── NetworkMonitor.kt
│   │   │   │   │   └── ConnectivityManager.kt
│   │   │   │   │
│   │   │   │   └── MyApplication.kt
│   │   │   │
│   │   │   ├── res/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── activity_login.xml
│   │   │   │   │   ├── activity_main.xml
│   │   │   │   │   ├── fragment_orders.xml
│   │   │   │   │   ├── fragment_order_detail.xml
│   │   │   │   │   ├── item_order.xml
│   │   │   │   │   ├── fragment_settings.xml
│   │   │   │   │   └── fragment_printer_setup.xml
│   │   │   │   ├── values/
│   │   │   │   │   ├── strings.xml
│   │   │   │   │   ├── colors.xml
│   │   │   │   │   ├── dimens.xml
│   │   │   │   │   └── styles.xml
│   │   │   │   ├── drawable/
│   │   │   │   └── menu/
│   │   │   │
│   │   │   └── AndroidManifest.xml
│   │   │
│   │   └── test/
│   │       ├── java/.../
│   │       │   ├── AuthViewModelTest.kt
│   │       │   ├── OrderRepositoryTest.kt
│   │       │   ├── PrintServiceTest.kt
│   │       │   └── ESCPOSFormatterTest.kt
│   │       └── AndroidManifest.xml
│   │
│   ├── build.gradle.kts
│   └── proguard-rules.pro
│
├── build.gradle.kts (root)
├── settings.gradle.kts
└── gradle.properties
```

---

## 2. BUILD.GRADLE DEPENDENCIES

```kotlin
// build.gradle.kts (Module: app)

plugins {
    id("com.android.application")
    kotlin("android")
    kotlin("kapt")
    id("kotlin-parcelize")
}

android {
    compileSdk = 34
    namespace = "com.saasplatform.terminal"

    defaultConfig {
        applicationId = "com.saasplatform.terminal"
        minSdk = 28
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"https://api.saasplatform.com\"")
        }
        debug {
            buildConfigField("String", "API_BASE_URL", "\"http://localhost:4000\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.3"
    }
}

dependencies {
    // Core
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.10.0")

    // Jetpack Compose
    implementation("androidx.compose.ui:ui:1.5.4")
    implementation("androidx.compose.material3:material3:1.1.1")
    implementation("androidx.compose.runtime:runtime-livedata:1.5.4")
    implementation("androidx.navigation:navigation-compose:2.7.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.6.1")

    // Lifecycle
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.1")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.6.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.6.1")

    // Jetpack Navigation
    implementation("androidx.navigation:navigation-fragment-ktx:2.7.3")
    implementation("androidx.navigation:navigation-ui-ktx:2.7.3")

    // Dependency Injection (Hilt)
    implementation("com.google.dagger:hilt-android:2.48")
    kapt("com.google.dagger:hilt-compiler:2.48")
    implementation("androidx.hilt:hilt-navigation-compose:1.0.0")

    // Networking
    implementation("com.apollographql.apollo:apollo-runtime:3.8.2")
    implementation("com.squareup.okhttp3:okhttp:4.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.11.0")

    // JSON Serialization
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")

    // Local Storage
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Firebase
    implementation(platform("com.google.firebase:firebase-bom:32.4.1"))
    implementation("com.google.firebase:firebase-messaging-ktx")
    implementation("com.google.firebase:firebase-analytics-ktx")
    implementation("com.google.firebase:firebase-crashlytics-ktx")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")

    // Logging
    implementation("com.jakewharton.timber:timber:5.0.1")

    // Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.1.0")
    testImplementation("app.cash.turbine:turbine:1.0.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")

    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.5.4")
}
```

---

## 3. AUTHENTICATION FLOW

### LoginActivity

```kotlin
// presentation/auth/LoginActivity.kt

import android.content.Intent
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.hilt.navigation.compose.hiltViewModel

@AndroidEntryPoint
class LoginActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            LoginScreen(
                onLoginSuccess = {
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                }
            )
        }
    }
}

@Composable
fun LoginScreen(
    viewModel: LoginViewModel = hiltViewModel(),
    onLoginSuccess: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var pin by remember { mutableStateOf("") }

    LaunchedEffect(uiState) {
        when (uiState) {
            is LoginViewModel.UiState.Success -> onLoginSuccess()
            else -> {}
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Terminal Point of Sale",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.padding(bottom = 32.dp)
        )

        // Email/Password login
        TextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp)
        )

        TextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)
        )

        Button(
            onClick = { viewModel.login(email, password) },
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
            enabled = email.isNotEmpty() && password.isNotEmpty()
        ) {
            Text("Se connecter")
        }

        if (uiState is LoginViewModel.UiState.Loading) {
            CircularProgressIndicator(
                modifier = Modifier.padding(top = 16.dp)
            )
        }

        if (uiState is LoginViewModel.UiState.Error) {
            Text(
                text = (uiState as LoginViewModel.UiState.Error).message,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(top = 16.dp)
            )
        }
    }
}
```

### LoginViewModel

```kotlin
// presentation/auth/LoginViewModel.kt

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val tokenManager: TokenManager
) : ViewModel() {

    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        object Success : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading

            try {
                val response = authRepository.login(email, password)
                
                // Save tokens
                tokenManager.saveAccessToken(response.accessToken)
                tokenManager.saveRefreshToken(response.refreshToken)

                // Register device
                registerDevice()

                _uiState.value = UiState.Success
            } catch (error: Exception) {
                _uiState.value = UiState.Error(error.message ?: "Login failed")
            }
        }
    }

    private suspend fun registerDevice() {
        try {
            val deviceId = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            )
            
            authRepository.registerDevice(
                storeId = tokenManager.getStoreId(),
                deviceId = deviceId,
                name = Build.MODEL
            )
        } catch (error: Exception) {
            Log.e("LoginViewModel", "Device registration failed", error)
            // Don't fail login if device registration fails
        }
    }
}
```

---

## 4. ORDERS MANAGEMENT

### OrdersFragment

```kotlin
// presentation/orders/OrdersFragment.kt

@AndroidEntryPoint
class OrdersFragment : Fragment() {
    private val viewModel: OrdersViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.ordersFlow.collect { orders ->
                    // Update UI with orders
                    adapter.submitList(orders)
                }
            }
        }
    }
}

@Composable
fun OrdersScreen(
    viewModel: OrdersViewModel = hiltViewModel()
) {
    val orders by viewModel.ordersFlow.collectAsState(initial = emptyList())
    val refreshing by viewModel.isRefreshing.collectAsState(initial = false)

    PullRefreshBox(
        refreshing = refreshing,
        onRefresh = { viewModel.refreshOrders() }
    ) {
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(orders) { order ->
                OrderCard(
                    order = order,
                    onClick = {
                        // Navigate to detail
                    }
                )
            }
        }
    }
}

@Composable
fun OrderCard(
    order: Order,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp)
            .clickable { onClick() },
        colors = CardDefaults.cardColors(
            containerColor = when (order.status) {
                "PENDING" -> Color(0xFFFFEBEE)
                "ACCEPTED" -> Color(0xFFF3E5F5)
                "READY" -> Color(0xFFE8F5E9)
                else -> Color.White
            }
        )
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Order #${order.orderNumber}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = formatTime(order.createdAt),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = "€${order.total.format(2)}",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }

            StatusBadge(status = order.status)
        }
    }
}
```

### OrdersViewModel

```kotlin
// presentation/orders/OrdersViewModel.kt

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _ordersFlow = MutableStateFlow<List<Order>>(emptyList())
    val ordersFlow: StateFlow<List<Order>> = _ordersFlow.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    init {
        loadOrders()
        // Set up polling for new orders
        startOrderPolling()
    }

    fun loadOrders() {
        viewModelScope.launch {
            try {
                _isRefreshing.value = true
                val orders = orderRepository.getOrders(
                    status = null, // Get all statuses
                    limit = 50
                )
                _ordersFlow.value = orders
            } catch (error: Exception) {
                Log.e("OrdersViewModel", "Failed to load orders", error)
            } finally {
                _isRefreshing.value = false
            }
        }
    }

    fun refreshOrders() {
        loadOrders()
    }

    private fun startOrderPolling() {
        viewModelScope.launch {
            while (currentCoroutineContext().isActive) {
                delay(5000) // Poll every 5 seconds
                try {
                    val orders = orderRepository.getOrders()
                    _ordersFlow.value = orders
                } catch (error: Exception) {
                    Log.e("OrdersViewModel", "Polling failed", error)
                }
            }
        }
    }
}
```

---

## 5. ORDER DETAIL & STATUS MANAGEMENT

### OrderDetailFragment

```kotlin
// presentation/orders/OrderDetailFragment.kt

@Composable
fun OrderDetailScreen(
    orderId: String,
    viewModel: OrderDetailViewModel = hiltViewModel()
) {
    val order by viewModel.orderFlow.collectAsState(initial = null)
    val isUpdating by viewModel.isUpdating.collectAsState(initial = false)

    order?.let { currentOrder ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            // Order Header
            Text(
                text = "Order #${currentOrder.orderNumber}",
                style = MaterialTheme.typography.headlineMedium
            )

            StatusBadge(status = currentOrder.status)

            Divider(modifier = Modifier.padding(vertical = 16.dp))

            // Order Items
            Text(
                text = "Items",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            currentOrder.items.forEach { item ->
                OrderItemRow(item = item)
            }

            Divider(modifier = Modifier.padding(vertical = 16.dp))

            // Pricing
            PricingBreakdown(order = currentOrder)

            Divider(modifier = Modifier.padding(vertical = 16.dp))

            // Status Actions
            when (currentOrder.status) {
                "PENDING" -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { viewModel.acceptOrder() },
                            modifier = Modifier.weight(1f),
                            enabled = !isUpdating
                        ) {
                            Text("Accept")
                        }

                        OutlinedButton(
                            onClick = { viewModel.rejectOrder() },
                            modifier = Modifier.weight(1f),
                            enabled = !isUpdating
                        ) {
                            Text("Reject")
                        }
                    }
                }
                "ACCEPTED" -> {
                    Button(
                        onClick = { viewModel.markAsReady() },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isUpdating
                    ) {
                        Text("Mark as Ready")
                    }
                }
                "READY" -> {
                    Button(
                        onClick = { viewModel.completeOrder() },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !isUpdating
                    ) {
                        Text("Mark as Completed")
                    }
                }
            }

            // Print Button
            OutlinedButton(
                onClick = { viewModel.printOrder() },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                enabled = !isUpdating
            ) {
                Text("Print Receipt")
            }

            if (isUpdating) {
                CircularProgressIndicator(
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = 16.dp)
                )
            }
        }
    }
}
```

### OrderDetailViewModel

```kotlin
// presentation/orders/OrderDetailViewModel.kt

@HiltViewModel
class OrderDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val orderRepository: OrderRepository,
    private val printService: PrintService
) : ViewModel() {

    private val orderId: String = checkNotNull(savedStateHandle["orderId"])

    private val _orderFlow = MutableStateFlow<Order?>(null)
    val orderFlow: StateFlow<Order?> = _orderFlow.asStateFlow()

    private val _isUpdating = MutableStateFlow(false)
    val isUpdating: StateFlow<Boolean> = _isUpdating.asStateFlow()

    init {
        loadOrder()
    }

    private fun loadOrder() {
        viewModelScope.launch {
            try {
                val order = orderRepository.getOrder(orderId)
                _orderFlow.value = order
            } catch (error: Exception) {
                Log.e("OrderDetailViewModel", "Failed to load order", error)
            }
        }
    }

    fun acceptOrder() {
        updateOrderStatus("ACCEPTED")
    }

    fun rejectOrder() {
        updateOrderStatus("REJECTED")
    }

    fun markAsReady() {
        updateOrderStatus("READY")
    }

    fun completeOrder() {
        updateOrderStatus("COMPLETED")
    }

    private fun updateOrderStatus(newStatus: String) {
        viewModelScope.launch {
            _isUpdating.value = true
            try {
                val updated = orderRepository.updateOrderStatus(
                    orderId = orderId,
                    status = newStatus
                )
                _orderFlow.value = updated
            } catch (error: Exception) {
                Log.e("OrderDetailViewModel", "Status update failed", error)
            } finally {
                _isUpdating.value = false
            }
        }
    }

    fun printOrder() {
        viewModelScope.launch {
            val order = _orderFlow.value ?: return@launch
            try {
                printService.printOrder(order)
            } catch (error: Exception) {
                Log.e("OrderDetailViewModel", "Print failed", error)
            }
        }
    }
}
```

---

## 6. PRINTER INTEGRATION

### PrintService

```kotlin
// services/PrintService.kt

@Singleton
class PrintService @Inject constructor(
    private val context: Context,
    private val printerRepository: PrinterRepository
) {

    suspend fun printOrder(order: Order) {
        // Get connected printer
        val printers = printerRepository.getPrinters(order.storeId)
        val printer = printers.firstOrNull { it.status == "ONLINE" }
            ?: throw Exception("No printer available")

        // Format order to ESC/POS
        val escPos = ESCPOSFormatter.formatOrder(order)

        // Send to printer
        sendToPrinter(printer, escPos)
    }

    private suspend fun sendToPrinter(printer: Printer, data: ByteArray) {
        try {
            val socket = Socket(printer.ipAddress, printer.port)
            val output = socket.getOutputStream()
            output.write(data)
            output.flush()
            socket.close()
        } catch (error: IOException) {
            throw Exception("Print failed: ${error.message}")
        }
    }

    fun discoverPrinters(): Flow<List<PrinterDevice>> = flow {
        // mDNS discovery for network printers
        val jmdns = JmDNS.create()
        val serviceListener = ServiceListenerImpl()
        jmdns.addServiceListener("_ipp._tcp.local.", serviceListener)

        delay(5000) // Wait for discovery

        val printers = serviceListener.discoveredPrinters.map { info ->
            PrinterDevice(
                name = info.name,
                ipAddress = info.inetAddress.hostAddress,
                port = info.port
            )
        }

        emit(printers)
        jmdns.close()
    }
}

// ESC/POS Formatter
object ESCPOSFormatter {
    fun formatOrder(order: Order): ByteArray {
        val output = ByteArrayOutputStream()

        // Initialize printer
        output.write(ESC.code)
        output.write(byteArrayOf(0x40)) // Reset

        // Set alignment to center
        output.write(ESC.code)
        output.write(byteArrayOf(0x61, 0x01))

        // Print order header
        output.write("ORDER #${order.orderNumber}".toByteArray())
        output.write(LF)
        output.write(LF)

        // Set alignment to left
        output.write(ESC.code)
        output.write(byteArrayOf(0x61, 0x00))

        // Print items
        order.items.forEach { item ->
            val line = String.format(
                "%-30s €%.2f",
                item.product.name.take(30),
                item.totalPrice
            )
            output.write(line.toByteArray())
            output.write(LF)
        }

        // Totals
        output.write(LF)
        output.write("----------------------------------------".toByteArray())
        output.write(LF)

        output.write(String.format(
            "Subtotal:%32.2f€",
            order.subtotal
        ).toByteArray())
        output.write(LF)

        if (order.deliveryFee > 0) {
            output.write(String.format(
                "Delivery:%33.2f€",
                order.deliveryFee
            ).toByteArray())
            output.write(LF)
        }

        // Set bold
        output.write(ESC.code)
        output.write(byteArrayOf(0x45, 0x01))

        output.write(String.format(
            "TOTAL:%37.2f€",
            order.total
        ).toByteArray())
        output.write(LF)

        // Reset bold
        output.write(ESC.code)
        output.write(byteArrayOf(0x45, 0x00))

        // Cut paper
        output.write(LF)
        output.write(ESC.code)
        output.write(byteArrayOf(0x69))

        return output.toByteArray()
    }

    private object ESC {
        val code = byteArrayOf(0x1B)
    }

    private const val LF = 0x0A.toByte()
}
```

---

## 7. FIREBASE PUSH NOTIFICATIONS

### NotificationService

```kotlin
// services/NotificationService.kt

@Singleton
class NotificationService @Inject constructor(
    private val context: Context
) {

    fun setupNotifications() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val token = task.result
                Log.d("FCM", "Token: $token")
                // Send token to backend
                // registerDeviceToken(token)
            }
        }
    }
}

// MyFirebaseMessagingService.kt

class MyFirebaseMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        // Handle notification
        remoteMessage.notification?.let { notification ->
            showNotification(
                title = notification.title ?: "",
                body = notification.body ?: ""
            )

            // Handle data payload
            when (remoteMessage.data["type"]) {
                "ORDER_CREATED" -> {
                    // Navigate to order
                    val orderId = remoteMessage.data["orderId"]
                    launchOrderDetail(orderId)
                }
                "ORDER_STATUS_CHANGED" -> {
                    // Refresh orders
                    refreshOrders()
                }
            }
        }
    }

    override fun onNewToken(token: String) {
        Log.d("FCM", "New token: $token")
        // Send token to backend
    }

    private fun showNotification(title: String, body: String) {
        val notificationId = System.currentTimeMillis().toInt()
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(this).notify(notificationId, notification)
    }

    companion object {
        private const val CHANNEL_ID = "orders_channel"
    }
}
```

---

## 8. DEPENDENCIES & SETUP

### AndroidManifest.xml

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    package="com.saasplatform.terminal">

    <!-- Network -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Printer -->
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

    <!-- Notifications -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application>
        <!-- Activities -->
        <activity
            android:name=".presentation.auth.LoginActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity
            android:name=".presentation.orders.MainActivity"
            android:exported="true" />

        <!-- Firebase Messaging Service -->
        <service
            android:name=".services.MyFirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <!-- Notification Channel -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="orders_channel" />
    </application>
</manifest>
```

---

## RÉSUMÉ TERMINAL ANDROID

| Aspect | Détail |
|--------|--------|
| **Framework** | Jetpack Compose + MVVM |
| **Architecture** | Clean Architecture (domain/data/presentation) |
| **DI** | Hilt |
| **Networking** | Apollo GraphQL |
| **Storage** | DataStore + encrypted SharedPreferences |
| **Notifications** | Firebase Cloud Messaging |
| **Printing** | ESC/POS over network (TCP) |
| **Discovery** | mDNS for printer discovery |
| **Offline** | Polling for new orders every 5 seconds |
| **Security** | JWT tokens, encrypted storage |
| **Target SDK** | 34 (Android 14) |

---

