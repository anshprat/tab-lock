#!/usr/bin/env swift

// Native messaging host for Tab Lock's Touch ID unlock.
//
// Speaks Chrome's native messaging protocol on stdin/stdout: each message is
// a 4-byte length prefix (native byte order) followed by that many bytes of
// UTF-8 JSON. Chrome launches this process, sends exactly one message via
// chrome.runtime.sendNativeMessage, reads exactly one response, then the
// process exits.
//
// This process never sees the extension's password or site list — it only
// asks macOS "is this the device owner, verified biometrically?" and reports
// back a plain success/failure.

import Foundation
import LocalAuthentication

func readMessage() -> [String: Any]? {
    let stdin = FileHandle.standardInput
    let lengthData = stdin.readData(ofLength: 4)
    guard lengthData.count == 4 else { return nil }
    let length = lengthData.withUnsafeBytes { $0.load(as: UInt32.self) }
    guard length > 0 else { return nil }
    let payload = stdin.readData(ofLength: Int(length))
    return (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any]
}

func writeMessage(_ message: [String: Any]) {
    guard let payload = try? JSONSerialization.data(withJSONObject: message) else { return }
    var length = UInt32(payload.count)
    let lengthData = Data(bytes: &length, count: 4)
    FileHandle.standardOutput.write(lengthData)
    FileHandle.standardOutput.write(payload)
}

let message = readMessage() ?? [:]
let action = message["action"] as? String ?? "authenticate"

let context = LAContext()
context.localizedCancelTitle = "Cancel"

var policyError: NSError?
let canEvaluate = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &policyError)

if action == "check" {
    var response: [String: Any] = ["available": canEvaluate]
    if let policyError {
        response["error"] = policyError.localizedDescription
    }
    writeMessage(response)
    exit(0)
}

guard canEvaluate else {
    writeMessage(["success": false, "error": policyError?.localizedDescription ?? "Touch ID is not available."])
    exit(0)
}

let reason = (message["reason"] as? String) ?? "unlock this site"
let semaphore = DispatchSemaphore(value: 0)
var result: [String: Any] = ["success": false, "error": "Unknown error."]

context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { success, error in
    if success {
        result = ["success": true]
    } else {
        result = ["success": false, "error": error?.localizedDescription ?? "Authentication failed."]
    }
    semaphore.signal()
}

semaphore.wait()
writeMessage(result)
