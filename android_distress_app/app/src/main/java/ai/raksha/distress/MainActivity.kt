package ai.raksha.distress

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private lateinit var txtStatus: TextView
    private lateinit var txtDispatchStatus: TextView
    private lateinit var btnDistress: Button
    private lateinit var inputName: EditText
    private lateinit var inputNotes: EditText
    private lateinit var inputServerUrl: EditText
    private lateinit var spinnerCategory: Spinner

    private val handler = Handler(Looper.getMainLooper())
    private var activeIncidentId: String? = null
    private var pollingActive = false

    private val categories = arrayOf(
        "Medical Emergency",
        "Road Accident",
        "Cardiac / Trauma",
        "Public Safety",
        "Fire Hazard"
    )

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            captureAndSendDistress()
        } else {
            txtStatus.text = "Location permission denied. Sending with demo coordinates..."
            sendIncident(28.6315, 77.2167, 15.0, true, "Connaught Place, New Delhi (Fallback)")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        txtStatus = findViewById(R.id.txtStatus)
        txtDispatchStatus = findViewById(R.id.txtDispatchStatus)
        btnDistress = findViewById(R.id.btnDistress)
        inputName = findViewById(R.id.inputName)
        inputNotes = findViewById(R.id.inputNotes)
        inputServerUrl = findViewById(R.id.inputServerUrl)
        spinnerCategory = findViewById(R.id.spinnerCategory)

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, categories)
        spinnerCategory.adapter = adapter

        btnDistress.setOnClickListener {
            val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
                captureAndSendDistress()
            } else {
                requestPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        pollingActive = false
        handler.removeCallbacksAndMessages(null)
    }

    @SuppressLint("MissingPermission")
    private fun captureAndSendDistress() {
        btnDistress.isEnabled = false
        txtStatus.text = "Capturing GPS location..."

        val client = LocationServices.getFusedLocationProviderClient(this)
        client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { loc ->
                if (loc != null) {
                    sendIncident(
                        loc.latitude,
                        loc.longitude,
                        loc.accuracy.toDouble(),
                        false,
                        "Android Device GPS"
                    )
                } else {
                    sendIncident(28.6315, 77.2167, 12.0, true, "Connaught Place, New Delhi (Demo GPS)")
                }
            }
            .addOnFailureListener {
                sendIncident(28.6315, 77.2167, 12.0, true, "Connaught Place, New Delhi (Demo GPS)")
            }
    }

    private fun sendIncident(
        lat: Double,
        lng: Double,
        accuracy: Double,
        isDemo: Boolean,
        label: String
    ) {
        val baseUrl = inputServerUrl.text.toString().trim().trimEnd('/')
        val reporter = inputName.text.toString().trim().ifEmpty { "Android Citizen" }
        val note = inputNotes.text.toString().trim().ifEmpty { "Triggered directly from Raksha SOS Android App" }
        val category = spinnerCategory.selectedItem?.toString() ?: "Medical Emergency"

        txtStatus.text = "Sending Distress SOS to Admin..."
        thread {
            try {
                val url = URL("$baseUrl/api/incidents")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    instanceFollowRedirects = false
                    setRequestProperty("Content-Type", "application/json")
                    connectTimeout = 12000
                    readTimeout = 12000
                    doOutput = true
                }

                val payload = JSONObject().apply {
                    put("type", "DISTRESS_SOS")
                    put("category", category)
                    put("reporterName", reporter)
                    put("reporterPhone", "Android Direct SOS")
                    put("locationLabel", label)
                    put("latitude", lat)
                    put("longitude", lng)
                    put("accuracyMeters", accuracy)
                    put("isDemoLocation", isDemo)
                    put("notes", note)
                }

                OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
                val code = conn.responseCode
                val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()?.readText().orEmpty()

                runOnUiThread {
                    btnDistress.isEnabled = true
                    if (code in 200..299 && body.trimStart().startsWith("{")) {
                        val json = JSONObject(body)
                        val incId = json.optString("id", "SENT")
                        activeIncidentId = incId
                        txtStatus.text = "SOS Sent! Incident ID: $incId\nAdmin Control Room alerted."
                        txtDispatchStatus.visibility = View.VISIBLE
                        txtDispatchStatus.text = "Waiting for Admin acceptance..."
                        startStatusPolling(baseUrl, incId)
                    } else if (code in 300..399 || body.contains("<html", ignoreCase = true)) {
                        txtStatus.text = "Server returned auth/redirect ($code). Share/Publish the app in AI Studio and use the Shared App URL (ais-pre-...)."
                    } else {
                        txtStatus.text = "Server error ($code): ${body.take(180)}"
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    btnDistress.isEnabled = true
                    txtStatus.text = "Failed: ${e.message}"
                }
            }
        }
    }

    private fun startStatusPolling(baseUrl: String, incidentId: String) {
        pollingActive = true
        val pollRunnable = object : Runnable {
            override fun run() {
                if (!pollingActive || activeIncidentId != incidentId) return
                thread {
                    try {
                        val url = URL("$baseUrl/api/state")
                        val conn = (url.openConnection() as HttpURLConnection).apply {
                            requestMethod = "GET"
                            connectTimeout = 8000
                            readTimeout = 8000
                        }
                        if (conn.responseCode in 200..299) {
                            val raw = conn.inputStream.bufferedReader().readText()
                            val incidents = JSONObject(raw).optJSONArray("incidents")
                            if (incidents != null) {
                                for (i in 0 until incidents.length()) {
                                    val inc = incidents.getJSONObject(i)
                                    if (inc.optString("id") == incidentId) {
                                        val status = inc.optString("status")
                                        val hospital = inc.optString("assignedHospitalName", "Nearest Hospital")
                                        val amb = inc.optString("assignedAmbulanceCode", "")
                                        val driver = inc.optString("driverName", "")
                                        val eta = inc.optInt("etaMinutes", 0)
                                        runOnUiThread {
                                            txtDispatchStatus.text = when (status) {
                                                "REPORTED" -> "Waiting for Admin acceptance ($hospital matched)..."
                                                "EN_ROUTE" -> "HELP ON THE WAY! $amb ($driver)\nHospital: $hospital · ETA $eta min"
                                                "ARRIVED" -> "Ambulance $amb has arrived at your location!"
                                                "RESOLVED" -> "Incident Resolved · Handover complete."
                                                else -> "Status: $status"
                                            }
                                        }
                                        if (status == "RESOLVED") pollingActive = false
                                        break
                                    }
                                }
                            }
                        }
                    } catch (_: Exception) {
                    }
                    if (pollingActive) {
                        handler.postDelayed(this, 2500)
                    }
                }
            }
        }
        handler.postDelayed(pollRunnable, 2000)
    }
}
