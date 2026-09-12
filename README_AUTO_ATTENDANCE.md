# SFPS Automatic Teacher Attendance

Teacher automatic attendance uses browser geolocation permission and the school geofence. The Owner must enable the teacher attendance registry. Attendance is recorded automatically after 08:00 IST, or at any time when the teacher's device is inside the configured school geofence.

Default school geofence coordinates are configured in the Node.js file database settings and can be changed by the owner/developer if the exact school GPS point is known.

The browser cannot provide location without the teacher granting location permission.
